export const CREDIT_CARD_OPERATORS = [
  "AU Bank Credit Card",
  "Axis Bank Credit Card",
  "BOBCARD One Credit Card",
  "Bandhan Bank Credit Card",
  "Bank Of India Credit Card",
  "Bank of Baroda - Credit Card",
  "CSB Bank Edge RuPay Credit Card",
  "CUB Credit Card",
  "Canara Bank Credit Card",
  "DBS Credit Card",
  "DCB Bank Credit Card",
  "Dhanlaxmi Bank Credit Card",
  "ESAF Bank Credit Card",
  "Federal Bank Credit Card",
  "HDFC Bank Credit Card",
  "HDFC Bank Pixel Credit Card",
  "HSBC Bank Credit Card",
  "ICICI Bank Credit Card",
  "IDBI Bank Credit Card",
  "IDFC FIRST Bank Credit Card",
  "IOB Credit Card",
  "Indian Bank Credit Card",
  "Indian Bank One Credit Card",
  "Indusind Bank Credit Card",
  "J&K Bank Credit Card",
  "Kotak Mahindra Bank Credit Card",
  "PNB Credit Card",
  "RBL Bank Credit Card",
  "SBI Card",
  "SBM Bank (India) Credit Card",
  "SIB One Credit Card",
  "Saraswat Bank Credit Card",
  "Suryoday SFB Credit Card",
  "Tamilnad Mercantile Bank Credit Card",
  "UBI Credit Card",
  "Yes Bank Credit Card",
];

export const MAX_BILL_AMOUNT = 100000;

export function calcServiceCharge(billAmount) {
  const a = Number(billAmount) || 0;
  if (a <= 0 || a > MAX_BILL_AMOUNT) return 0;
  return a <= 50000 ? 15 : 25;
}
