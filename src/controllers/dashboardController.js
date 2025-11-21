const mongoose = require("mongoose");
const Users = require("../models/Users");
const Project = require("../models/Projects");
const WorkLogs = require("../models/Worklog");
const Contracts = require("../models/Contracts");
const Invoice = require("../models/Invoice");
const { successResponse, errorResponse } = require("../utils/response");
const { addTimeHours, toDecimalHours } = require("../utils/Halpers");
const { convertToINR } = require("../utils/currencyConverter");

function formatNumber(num) {
  if (!num) return "0";

  if (num >= 1_000_000_000)
    return (num / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + "B";

  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(2).replace(/\.00$/, "") + "M";

  if (num >= 1_000) return (num / 1_000).toFixed(2).replace(/\.00$/, "") + "K";

  return num.toFixed(2).replace(/\.00$/, "");
}

// ✅ Admin Dashboard Controller
exports.getAdminDashboard = async (req, res) => {
  try {
    // =============================
    // 🧩 A. OVERVIEW CARDS
    // =============================

    // 👥 Users Summary
    const totalUsers = await Users.countDocuments({ isDeleted: false });
    const userByRole = await Users.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    // 💼 Projects Summary
    const totalProjects = await Project.countDocuments({ isDeleted: false });
    const projectStatus = await Project.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // 📅 Contracts Summary
    const totalContracts = await Contracts.countDocuments({ isDeleted: false });
    const contractStatus = await Contracts.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // 🧾 Invoices Summary
    const invoiceStatus = await Invoice.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // 💰 Revenue Overview
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;

    const allInvoices = await Invoice.find({ isDeleted: false });

    for (const inv of allInvoices) {
      const inr = await convertToINR(inv.amount, inv.currency);

      if (inv.status === "Paid") paidAmount += inr;
      if (inv.status === "Pending") pendingAmount += inr;
      if (inv.status === "Overdue") overdueAmount += inr;
    }

    // =============================
    // 🧩 B. PROJECT INSIGHTS
    // =============================
    const projectInsights = await Project.aggregate([
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: "users",
          localField: "manager",
          foreignField: "_id",
          as: "managerDetails",
        },
      },
      {
        $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          name: 1,
          status: 1,
          phase: 1,
          deadline: 1,
          budget: 1,
          spentAmount: 1,
          "managerDetails.firstName": 1,
          "managerDetails.lastName": 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
    ]);

    // =============================
    // 🧩 C. TEAM & PERFORMANCE
    // =============================

    // Top performing developers (Approved hours)
    const topDevelopersRaw = await WorkLogs.aggregate([
      { $match: { isDeleted: false } },

      // Group by developer
      {
        $group: {
          _id: "$developer",
          totalHours: { $sum: "$hours" },
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: {
              $cond: [{ $in: ["$status", ["Completed", "Reviewed"]] }, 1, 0],
            },
          },
          approvedHours: {
            $sum: {
              $cond: [{ $eq: ["$approvalStatus", "Approved"] }, "$hours", 0],
            },
          },
        },
      },

      // Lookup developer details
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "developer",
        },
      },
      { $unwind: "$developer" },

      // Compute progress percent
      {
        $project: {
          _id: 0,
          name: {
            $concat: ["$developer.firstName", " ", "$developer.lastName"],
          },
          department: "$developer.department",
          profileImage: "$developer.profileImage",
          totalHoursDecimal: { $round: ["$approvedHours", 2] },
          totalTasks: 1,
          completedTasks: 1,
          progressPercent: {
            $cond: [
              { $eq: ["$totalTasks", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$completedTasks", "$totalTasks"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },
        },
      },

      // Sort by total approved hours (decimal)
      { $sort: { totalHoursDecimal: -1 } },
      { $limit: 5 },
    ]);

    const topDevelopers = topDevelopersRaw.map((dev) => {
      const hhmm = addTimeHours([dev.totalHoursDecimal]);
      return {
        ...dev,
        totalHoursHHMM: hhmm,
        totalHoursDecimal: toDecimalHours(hhmm), // ensures proper rounding + minute conversion
      };
    });

    // Active developers (who logged work this week)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const activeDevelopers = await WorkLogs.distinct("developer", {
      date: { $gte: oneWeekAgo },
      isDeleted: false,
    });

    // Department-wise utilization
    const deptUtilization = await Users.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]);

    // =============================
    // 🧩 D. FINANCIAL ANALYTICS
    // =============================

    // Monthly Revenue (Paid Invoices)
    const paidInvoices = await Invoice.find({
      status: "Paid",
      isDeleted: false,
    }).sort({ issueDate: 1 });

    const monthlyMap = {};

    for (const inv of paidInvoices) {
      const month = inv.issueDate.toLocaleString("en-US", { month: "short" });
      const inr = await convertToINR(inv.amount, inv.currency);

      monthlyMap[month] = (monthlyMap[month] || 0) + inr;
    }

    const monthlyRevenue = Object.keys(monthlyMap).map((month) => ({
      month,
      total: monthlyMap[month],
    }));

    // Outstanding Payments
    const outstandingPayments = pendingAmount + overdueAmount;

    // Top Clients by revenue
    const paidInv = await Invoice.find({ status: "Paid", isDeleted: false });

    const clientMap = {};

    for (const inv of paidInv) {
      const inr = await convertToINR(inv.amount, inv.currency);
      clientMap[inv.clientName] = (clientMap[inv.clientName] || 0) + inr;
    }

    const topClients = Object.entries(clientMap)
      .map(([client, totalPaid]) => ({
        _id: client,
        totalPaid: formatNumber(totalPaid),
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 5);

    // Contracts nearing end date (within 15 days)
    const soonEndingContracts = await Contracts.find({
      isDeleted: false,
      endDate: { $lte: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
    })
      .populate("project", "name")
      .limit(5);

    // =============================
    // 🧩 E. ACTIVITY FEED
    // =============================
    const recentUsers = await Users.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("firstName lastName role createdAt");

    const recentProjects = await Project.find({ isDeleted: false })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("name status updatedAt");

    const recentWorklogs = await WorkLogs.find({
      isDeleted: false,
      approvalStatus: "Approved",
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate("developer", "firstName lastName")
      .select("title approvalStatus updatedAt");

    const recentInvoices = await Invoice.find({ isDeleted: false })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("invoiceNumber status amount updatedAt");

    // =============================
    // ✅ SUCCESS RESPONSE
    // =============================
    return successResponse(res, "Admin dashboard data fetched successfully", {
      overview: {
        totalUsers,
        userByRole,
        totalProjects,
        projectStatus,
        totalContracts,
        contractStatus,
        invoiceStatus,
        revenue: {
          paidAmount: formatNumber(paidAmount),
          pendingAmount: formatNumber(pendingAmount),
          overdueAmount: formatNumber(overdueAmount),
          outstanding: formatNumber(outstandingPayments),
        },
      },
      projectInsights,
      performance: {
        topDevelopers,
        activeDevelopersCount: activeDevelopers.length,
        deptUtilization,
      },
      financials: {
        monthlyRevenue,
        outstandingPayments: formatNumber(outstandingPayments),
        topClients,
        soonEndingContracts,
      },
      activityFeed: {
        recentUsers,
        recentProjects,
        recentWorklogs,
        recentInvoices,
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    return errorResponse(res, "Error fetching admin dashboard data", error);
  }
};

// --- Place helper functions (parseHourEntry, addTimeHours, toDecimalHours) here --- //

exports.getDeveloperDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentDate = new Date();

    // --- assignedProjects & totalWorklogs unchanged ---
    const assignedProjects = await Project.find({
      developers: userId,
      isDeleted: false,
    }).populate("manager", "firstName lastName");

    const totalWorklogs = await WorkLogs.find({ developer: userId }).populate(
      "project",
      "name"
    );

    const approvedLogs = totalWorklogs.filter(
      (w) => w.approvalStatus === "Approved"
    );
    const pendingLogs = totalWorklogs.filter(
      (w) => w.approvalStatus === "Pending"
    );
    const rejectedLogs = totalWorklogs.filter(
      (w) => w.approvalStatus === "Rejected"
    );

    const billableLogs = totalWorklogs.filter((w) => w.isBillable);
    const nonBillableLogs = totalWorklogs.filter((w) => !w.isBillable);

    // ----------------------
    //  HOURS THIS WEEK / MONTH (use addTimeHours)
    // ----------------------
    const startOfWeek = new Date();
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const weekHoursArray = totalWorklogs
      .filter((w) => new Date(w.date) >= startOfWeek)
      .map((w) => w.hours || 0);

    const hoursThisWeek = addTimeHours(weekHoursArray); // returns "H.MM" string

    const monthHoursArray = totalWorklogs
      .filter((w) => new Date(w.date) >= startOfMonth)
      .map((w) => w.hours || 0);

    const hoursThisMonth = addTimeHours(monthHoursArray); // returns "H.MM" string

    // ----------------------
    //  GROUPED RECENT WORKLOGS (use arrays + addTimeHours)
    // ----------------------
    const recentGroupedWorklogs = Object.values(
      totalWorklogs
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .reduce((acc, w) => {
          const day = new Date(w.date).toISOString().split("T")[0];

          if (!acc[day]) {
            acc[day] = {
              date: day,
              logs: [],
              hoursArray: [],
              approvedHoursArray: [],
            };
          }

          acc[day].logs.push({
            _id: w._id,
            date: w.date,
            title: w.title,
            hours: w.hours,
            projectName: w.project?.name,
            status: w.approvalStatus,
            remarks: w.remarks,
          });

          acc[day].hoursArray.push(w.hours || 0);
          if (w.approvalStatus === "Approved") {
            acc[day].approvedHoursArray.push(w.hours || 0);
          }

          return acc;
        }, {})
    )
      .map((day) => {
        const totalHoursHHMM = addTimeHours(day.hoursArray); // "17.15"
        const approvedHoursHHMM = addTimeHours(day.approvedHoursArray);

        // efficiency needs decimal hours (approvedHours in decimal / 8)
        const approvedDecimal = toDecimalHours(approvedHoursHHMM);

        return {
          date: day.date,
          logs: day.logs.slice(0, 2),
          totalHours: totalHoursHHMM,
          approvedHours: approvedHoursHHMM,
          efficiency: Math.min(
            100,
            Number(((approvedDecimal / 8) * 100).toFixed(2))
          ),
        };
      })
      .slice(0, 10);

    // ----------------------
    //  PRODUCTIVITY: Weekly hours (return both display and decimal)
    // ----------------------
    const weeklyHours = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
      (d) => {
        const hoursArr = totalWorklogs
          .filter(
            (w) =>
              new Date(w.date).toLocaleString("en-US", { weekday: "short" }) ===
              d
          )
          .map((w) => w.hours || 0);

        const hhmm = addTimeHours(hoursArr);
        const decimal = toDecimalHours(hhmm);

        return { day: d, hhmm, decimal };
      }
    );

    // ----------------------
    //  PRODUCTIVITY: Monthly logs (compute in JS to preserve HH.MM semantics)
    // ----------------------
    const monthMap = {}; // {1: {approvedArr:[], pendingArr:[]}, ...}
    totalWorklogs.forEach((w) => {
      const m = new Date(w.date).getMonth() + 1; // 1..12
      if (!monthMap[m]) monthMap[m] = { approvedArr: [], pendingArr: [] };

      if (w.approvalStatus === "Approved")
        monthMap[m].approvedArr.push(w.hours || 0);
      if (w.approvalStatus === "Pending")
        monthMap[m].pendingArr.push(w.hours || 0);
    });

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // -----------------------
    // MONTHLY LOGS (HH:MM + Decimal)
    // -----------------------
    const monthlyLogs = Object.keys(monthMap)
      .map((mStr) => {
        const m = Number(mStr);

        // Monthly totals in HH:MM format
        const approvedHHMM = addTimeHours(monthMap[m].approvedArr);
        const pendingHHMM = addTimeHours(monthMap[m].pendingArr);

        return {
          month: monthNames[m - 1],
          monthIndex: m,
          approvedHHMM,
          pendingHHMM,
          approvedDecimal: toDecimalHours(approvedHHMM),
          pendingDecimal: toDecimalHours(pendingHHMM),
        };
      })
      .sort((a, b) => a.monthIndex - b.monthIndex);

    // -----------------------
    // DAILY AVERAGE (Approved)
    // -----------------------
    const totalApprovedHoursHHMM = addTimeHours(
      approvedLogs.map((w) => w.hours || 0)
    );

    const totalApprovedDecimal = toDecimalHours(totalApprovedHoursHHMM);

    const averageDailyHours = Number((totalApprovedDecimal / 30).toFixed(2));

    // ----------------------------
    // MONTHLY TOTALS (Using Decimal)
    // ----------------------------
    const totalApprovedMonthlyDecimal = toDecimalHours(
      addTimeHours(monthlyLogs.map((m) => m.approvedHHMM))
    );

    const totalPendingMonthlyDecimal = toDecimalHours(
      addTimeHours(monthlyLogs.map((m) => m.pendingHHMM))
    );

    const activeMonths = monthlyLogs.length || 1;

    // ----------------------------
    // MONTHLY AVERAGES
    // ----------------------------
    const avgApprovedMonthlyHours = Number(
      (totalApprovedMonthlyDecimal / activeMonths).toFixed(2)
    );

    const avgPendingMonthlyHours = Number(
      (totalPendingMonthlyDecimal / activeMonths).toFixed(2)
    );

    // ----------------------
    //  FINAL RESPONSE PAYLOAD
    // ----------------------
    const dashboardData = {
      overview: {
        assignedProjectsCount: assignedProjects.length,
        hoursLogged: {
          thisWeek: hoursThisWeek, // "H.MM" string
          thisMonth: hoursThisMonth, // "H.MM" string
        },
        logsStatus: {
          approved: approvedLogs.length,
          pending: pendingLogs.length,
          rejected: rejectedLogs.length,
        },
        billable: {
          billableHours: addTimeHours(billableLogs.map((w) => w.hours || 0)),
          nonBillableHours: addTimeHours(
            nonBillableLogs.map((w) => w.hours || 0)
          ),
        },
      },

      myProjects: assignedProjects.map((p) => ({
        _id: p._id,
        name: p.name,
        manager: p.manager,
        phase: p.phase,
        status: p.status,
        deadline: p.deadline,
        // unchanged logic for project progress — relies on estimatedHours/actualHours fields
        progress:
          p.estimatedHours > 0
            ? Math.min(
                100,
                Number(((p.actualHours / p.estimatedHours) * 100).toFixed(2))
              )
            : 0,
      })),

      myWorklogs: recentGroupedWorklogs,
      productivity: {
        weeklyHours, // array with {day, hhmm, decimal}
        monthlyLogs, // array with months in proper order
        averageDailyHours,
        avgApprovedMonthlyHours, // 🔥 NEW
        avgPendingMonthlyHours, // 🔥 NEW
      },

      summary: {
        totalProjectsWorked: assignedProjects.length,
        totalApprovedHours: totalApprovedHoursHHMM,
        averageRating: 4.6,
        nextMilestones: assignedProjects.map((p) => ({
          project: p.name,
          milestone: p.phase,
          dueDate: p.deadline,
        })),
      },
    };

    return successResponse(
      res,
      "Developer dashboard data fetched successfully",
      dashboardData
    );
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Failed to fetch developer dashboard", error);
  }
};
