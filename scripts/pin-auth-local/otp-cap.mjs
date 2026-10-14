import { sendOtp, useOtpDeliver, useOtpRpc } from "../../lib/registration/otpAuth.mjs";

const phone = "+580000000701";
let issues = 0;
let sends = 0;

useOtpRpc(async () => {
  issues += 1;
  return { ok: true, code: "OTP_SENT", phone };
});
useOtpDeliver(async () => {
  sends += 1;
  return { ok: true };
});

delete process.env.ENABLE_WHATSAPP_OTP;
const disabled = await sendOtp({ phone });
const flagOff = disabled.code === "OTP_DISABLED" && issues === 0 && sends === 0;

process.env.ENABLE_WHATSAPP_OTP = "true";
issues = 0;
sends = 0;
useOtpRpc(async (fn) => {
  if (fn !== "pulse_otp_issue") return { ok: false, code: "OTP_DISABLED" };
  issues += 1;
  if (issues > 3) return { ok: false, code: "OTP_RATE_LIMITED", error: "Has solicitado demasiados códigos." };
  return { ok: true, code: "OTP_SENT", phone };
});

const codes = [];
for (let n = 0; n < 4; n += 1) {
  const result = await sendOtp({ phone });
  codes.push(result.code);
}

const capped = codes[0] === "OTP_SENT" && codes[1] === "OTP_SENT" && codes[2] === "OTP_SENT" && codes[3] === "OTP_RATE_LIMITED" && sends === 3 && issues === 4;

console.log(JSON.stringify({ flagOff, capped, codes, sends, issues }));
if (!flagOff || !capped) process.exit(1);
