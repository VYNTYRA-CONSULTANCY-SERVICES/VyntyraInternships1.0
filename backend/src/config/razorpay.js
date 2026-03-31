import Razorpay from "razorpay";

let razorpay;

export const getRazorpayClient = () => {
  if (razorpay) {
    return razorpay;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    error.statusCode = 500;
    throw error;
  }

  razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpay;
};

export default getRazorpayClient;
