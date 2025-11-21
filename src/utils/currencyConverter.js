// utils/currencyConverter.js

const axios = require("axios");

// fallback values already expressed as: 1 CURRENCY = X INR
const fallbackRates = {
  INR: 1,
  USD: 83.2,
  EUR: 90.15,
  GBP: 104.75,
  AUD: 55.1,
  CAD: 61.2,
  AED: 22.65,
  JPY: 0.56,
  CNY: 11.5,
  SGD: 62.25,
};

async function getRateToINR(currency) {
  try {
    const res = await axios.get(
      `https://open.er-api.com/v6/latest/${currency}`
    );
    console.log("rate", res.data.rates.INR);
    if (!res.data?.rates?.INR) throw new Error("INR rate missing");

    return res.data.rates.INR; // API returns: 1 currency = X INR
  } catch (err) {
    console.log("⚠ API failed → using fallback for", currency);
    return fallbackRates[currency] || 1;
  }
}

async function convertToINR(amount, fromCurrency) {
  if (!amount) return 0;

  // If already INR → return directly
  if (fromCurrency === "INR") return amount;

  const rateToINR = await getRateToINR(fromCurrency);
  return amount * rateToINR; // convert correctly
}

module.exports = { convertToINR };
