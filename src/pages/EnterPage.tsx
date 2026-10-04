import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkAlias, FlowError } from "@/services/accountApi";
import { usePulse } from "@/state/PulseContext";

type Step = "phone" | "otp" | "profile";

const COUNTRIES = [
  { iso: "VE", dial: "+58", flag: "🇻🇪", label: "Venezuela" },
  { iso: "CO", dial: "+57", flag: "🇨🇴", label: "Colombia" },
  { iso: "US", dial: "+1", flag: "🇺🇸", label: "EE.UU." },
  { iso: "MX", dial: "+52", flag: "🇲🇽", label: "México" },
  { iso: "ES", dial: "+34", flag: "🇪🇸", label: "España" },
];

const ZONES = ["Caracas", "Valencia", "Maracaibo", "Barquisimeto", "Puerto La Cruz", "Lechería", "Maracay", "Otra"];

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function composePhone(dial: string, local: string) {
  const digits = onlyDigits(local);
  if (dial === "+58") {
    if (digits.startsWith("0")) return `+58${digits.slice(1)}`;
    if (digits.startsWith("58")) return `+${digits}`;
    return `+58${digits}`;
  }
  if (digits.startsWith(dial.slice(1))) return `+${digits}`;
  return `${dial}${digits}`;
}

function maskPhone(phone: string) {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)} •••• ${phone.slice(-4)}`;
}

const fieldClass =
  "mt-1 h-14 w-full rounded-2xl border-2 bg-white px-4 text-[16px] font-bold outline-none";

export function EnterPage({ hint = "" }: { hint?: string }) {
  const { requestOtp, confirmOtp, finishSignup, authError, setAuthError } = usePulse();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [localPhone, setLocalPhone] = useState("");
  const [e164, setE164] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [alias, setAlias] = useState("");
  const [city, setCity] = useState("Caracas");
  const [ticket, setTicket] = useState("");
  const [pending, setPending] = useState(false);
  const [sentNote, setSentNote] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [aliasState, setAliasState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (step !== "profile") return undefined;
    const value = alias.trim();
    if (value.length < 3) {
      setAliasState(value ? "invalid" : "idle");
      return undefined;
    }
    setAliasState("checking");
    let alive = true;
    const id = window.setTimeout(() => {
      checkAlias(value)
        .then((result) => {
          if (!alive) return;
          setAliasState(result.available ? "free" : result.code === "INVALID_ALIAS" ? "invalid" : "taken");
        })
        .catch(() => {
          if (alive) setAliasState("idle");
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [alias, step]);

  async function sendCode(phone = composePhone(country.dial, localPhone)) {
    setPending(true);
    setAuthError("");
    setSentNote("");
    try {
      await requestOtp(phone);
      setE164(phone);
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
      setCooldown(30);
      setSentNote("Código enviado por WhatsApp.");
      window.setTimeout(() => inputs.current[0]?.focus(), 40);
    } catch (error) {
      if (error instanceof FlowError && error.retryAfter) setCooldown(error.retryAfter);
    } finally {
      setPending(false);
    }
  }

  async function onPhone(event: FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function submitOtp(code: string) {
    if (code.length !== 6 || pending) return;
    setPending(true);
    setAuthError("");
    try {
      const result = await confirmOtp(e164, code);
      if (result.isNew && result.ticket) {
        setTicket(result.ticket);
        setStep("profile");
        return;
      }
    } catch {
      setOtp(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setPending(false);
    }
  }

  function onOtpChange(index: number, value: string) {
    const digit = onlyDigits(value).slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
    const joined = next.join("");
    if (joined.length === 6) void submitOtp(joined);
  }

  function onOtpKey(index: number, key: string) {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function onOtpPaste(value: string) {
    const digits = onlyDigits(value).slice(0, 6).split("");
    if (!digits.length) return;
    const next = ["", "", "", "", "", ""];
    digits.forEach((d, i) => {
      next[i] = d;
    });
    setOtp(next);
    if (digits.length === 6) void submitOtp(digits.join(""));
    else inputs.current[digits.length]?.focus();
  }

  async function onProfile(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setAuthError("");
    try {
      await finishSignup(ticket, alias, city);
    } catch {
      /* authError lives in context */
    } finally {
      setPending(false);
    }
  }

  const titles: Record<Step, string> = {
    phone: "Entra con WhatsApp",
    otp: "Revisa tu WhatsApp",
    profile: "Cómo te ven en Pulse",
  };
  const copies: Record<Step, string> = {
    phone: "Te enviamos un código de 6 dígitos. Sin contraseñas.",
    otp: `Escribe el código que llegó a ${maskPhone(e164)}.`,
    profile: "Solo la primera vez. Así apareces en los rankings.",
  };

  return (
    <div
      className="flex h-full flex-col px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white"
          style={{ backgroundColor: "var(--p-accent)", boxShadow: "0 8px 16px rgba(24,160,133,0.28)" }}
        >
          P
        </div>
        <p className="text-[18px] font-extrabold tracking-tight">Pulse</p>
      </div>

      <div className="mt-6 flex gap-1.5">
        {(["phone", "otp", "profile"] as Step[]).map((item) => (
          <span
            key={item}
            className="h-1.5 flex-1 rounded-full"
            style={{
              backgroundColor:
                step === item || (step === "otp" && item === "phone") || step === "profile"
                  ? "var(--p-accent)"
                  : "#CDE8E1",
            }}
          />
        ))}
      </div>

      <h1 className="mt-6 text-[32px] font-extrabold leading-tight tracking-tight">{titles[step]}</h1>
      {hint && (
        <p className="mt-3 text-[14px] font-extrabold" style={{ color: "var(--p-coral)" }}>
          {hint}
        </p>
      )}
      <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--p-muted)" }}>
        {copies[step]}
      </p>

      {step === "phone" && (
        <form onSubmit={onPhone} className="mt-6 flex flex-1 flex-col gap-3">
          <label className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
            País
            <select
              value={country.iso}
              onChange={(event) => {
                const next = COUNTRIES.find((item) => item.iso === event.target.value) ?? COUNTRIES[0];
                setCountry(next);
              }}
              className={fieldClass}
              style={{ borderColor: "#D7EDE7", color: "var(--p-text)" }}
            >
              {COUNTRIES.map((item) => (
                <option key={item.iso} value={item.iso}>
                  {item.flag} {item.label} {item.dial}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
            Celular
            <div className="mt-1 flex gap-2">
              <span
                className="flex h-14 items-center rounded-2xl border-2 bg-white px-3 text-[15px] font-extrabold"
                style={{ borderColor: "#D7EDE7", color: "var(--p-accent)" }}
              >
                {country.dial}
              </span>
              <input
                value={localPhone}
                onChange={(event) => setLocalPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder={country.iso === "VE" ? "412 000 0000" : "Número"}
                className={`${fieldClass} mt-0 flex-1`}
                style={{ borderColor: "#D7EDE7", color: "var(--p-text)" }}
              />
            </div>
          </label>
          {authError && <p className="text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
          <div className="mt-auto">
            <button
              type="submit"
              disabled={pending || onlyDigits(localPhone).length < 7}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-extrabold text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--p-accent)", boxShadow: "0 12px 24px rgba(24,160,133,0.28)" }}
            >
              {pending ? "Enviando código..." : "Enviar código por WhatsApp"}
            </button>
            <p className="mt-4 text-center text-[12px] font-semibold" style={{ color: "var(--p-muted)" }}>
              La primera vez, envía el mensaje de unión del sandbox de Twilio al +1 737 250 8034 y después pide el código.
            </p>
          </div>
        </form>
      )}

      {step === "otp" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitOtp(otp.join(""));
          }}
          className="mt-6 flex flex-1 flex-col"
        >
          <div className="flex justify-between gap-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                value={digit}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                onChange={(event) => onOtpChange(index, event.target.value)}
                onKeyDown={(event) => onOtpKey(index, event.key)}
                onPaste={(event) => {
                  event.preventDefault();
                  onOtpPaste(event.clipboardData.getData("text"));
                }}
                className="h-16 w-full rounded-2xl border-2 bg-white text-center text-[24px] font-extrabold outline-none"
                style={{ borderColor: digit ? "var(--p-accent)" : "#D7EDE7", color: "var(--p-text)" }}
              />
            ))}
          </div>
          {sentNote && !authError && (
            <p className="mt-4 text-center text-[14px] font-extrabold" style={{ color: "var(--p-accent)" }}>
              ✓ {sentNote}
            </p>
          )}
          {authError && <p className="mt-4 text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
          <div className="mt-auto">
            <button
              type="submit"
              disabled={pending || otp.join("").length !== 6}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-extrabold text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--p-accent)", boxShadow: "0 12px 24px rgba(24,160,133,0.28)" }}
            >
              {pending ? "Validando…" : "Confirmar código"}
            </button>
            <button
              type="button"
              disabled={pending || cooldown > 0}
              onClick={() => void sendCode(e164)}
              className="mt-4 w-full text-center text-[14px] font-extrabold disabled:opacity-40"
              style={{ color: "var(--p-accent)" }}
            >
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setAuthError("");
              }}
              className="mt-3 w-full text-center text-[13px] font-extrabold"
              style={{ color: "var(--p-muted)" }}
            >
              Cambiar número
            </button>
          </div>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={onProfile} className="mt-6 flex flex-1 flex-col gap-3">
          <label className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
            Apodo / username
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value.replace(/\s/g, ""))}
              autoComplete="nickname"
              maxLength={20}
              placeholder="vicente2"
              className={fieldClass}
              style={{ borderColor: "#D7EDE7", color: "var(--p-text)" }}
            />
          </label>
          {aliasState === "checking" && (
            <p className="text-[13px] font-bold" style={{ color: "var(--p-muted)" }}>Revisando alias...</p>
          )}
          {aliasState === "free" && (
            <p className="text-[13px] font-extrabold" style={{ color: "var(--p-accent)" }}>✓ Alias disponible</p>
          )}
          {aliasState === "taken" && (
            <p className="text-[13px] font-extrabold text-[#E23B2F]">✕ Este alias ya está ocupado</p>
          )}
          {aliasState === "invalid" && (
            <p className="text-[13px] font-bold" style={{ color: "var(--p-muted)" }}>De 3 a 20 letras, números o _.</p>
          )}
          <div>
            <p className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              Ciudad / zona
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ZONES.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setCity(zone === "Otra" ? "" : zone)}
                  className="rounded-full px-3 py-2 text-[12px] font-extrabold"
                  style={
                    city === zone || (zone === "Otra" && !ZONES.slice(0, -1).includes(city))
                      ? { backgroundColor: "var(--p-accent)", color: "white" }
                      : { backgroundColor: "white", color: "var(--p-muted)" }
                  }
                >
                  {zone}
                </button>
              ))}
            </div>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Tu ciudad o zona"
              className={fieldClass}
              style={{ borderColor: "#D7EDE7", color: "var(--p-text)" }}
            />
          </div>
          {authError && <p className="text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
          <div className="mt-auto">
            <button
              type="submit"
              disabled={pending || aliasState !== "free" || city.trim().length < 2}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-extrabold text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--p-accent)", boxShadow: "0 12px 24px rgba(24,160,133,0.28)" }}
            >
              {pending ? "Creando perfil…" : "Entrar a Pulse"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
