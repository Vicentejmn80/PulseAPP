import { useEffect, useState, type FormEvent } from "react";
import { RusherMark } from "@/components/ui/RusherMark";
import { RusherSplash } from "@/components/ui/RusherSplash";
import { checkAlias, FlowError } from "@/services/accountApi";
import { usePulse } from "@/state/PulseContext";

type Mode = "choose" | "register" | "login";

const COUNTRIES = [
  { iso: "VE", dial: "+58", flag: "🇻🇪", label: "Venezuela" },
  { iso: "CO", dial: "+57", flag: "🇨🇴", label: "Colombia" },
  { iso: "US", dial: "+1", flag: "🇺🇸", label: "EE.UU." },
  { iso: "MX", dial: "+52", flag: "🇲🇽", label: "México" },
  { iso: "ES", dial: "+34", flag: "🇪🇸", label: "España" },
];

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

const fieldClass = "mt-1 h-14 w-full rounded-2xl border bg-[#14171A] px-4 text-[16px] font-bold text-[#F5F7F2] outline-none";

export function EnterPage({ hint = "" }: { hint?: string }) {
  const { createAccount, loginWithPin, authError, setAuthError } = usePulse();
  const [step, setStep] = useState<"splash" | "welcome" | "auth">("splash");
  const [splashPhase, setSplashPhase] = useState<"play" | "exit">("play");
  const [mode, setMode] = useState<Mode>("choose");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [localPhone, setLocalPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [aliasState, setAliasState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const [switchHint, setSwitchHint] = useState<"login" | "register" | "">("");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 500 : 2300;
    const exit = reduced ? 200 : 420;
    const startExit = window.setTimeout(() => setSplashPhase("exit"), hold);
    const next = window.setTimeout(() => setStep("welcome"), hold + exit);
    return () => {
      window.clearTimeout(startExit);
      window.clearTimeout(next);
    };
  }, []);

  useEffect(() => {
    if (mode !== "register") return undefined;
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
  }, [alias, mode]);

  function open(next: Mode) {
    setMode(next);
    setAuthError("");
    setSwitchHint("");
    setPin("");
    setPinConfirm("");
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    if (pin !== pinConfirm) {
      setAuthError("Los PIN no coinciden.");
      return;
    }
    setPending(true);
    setAuthError("");
    setSwitchHint("");
    try {
      await createAccount(composePhone(country.dial, localPhone), fullName.trim(), alias.trim(), pin);
    } catch (error) {
      if (error instanceof FlowError && error.code === "PHONE_ALREADY_REGISTERED") setSwitchHint("login");
      if (error instanceof FlowError && error.code === "ALIAS_ALREADY_TAKEN") setSwitchHint("");
    } finally {
      setPending(false);
    }
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setAuthError("");
    setSwitchHint("");
    try {
      await loginWithPin(composePhone(country.dial, localPhone), pin);
    } catch (error) {
      if (error instanceof FlowError && error.code === "ACCOUNT_NOT_FOUND") setSwitchHint("register");
    } finally {
      setPending(false);
    }
  }

  const phoneReady = onlyDigits(localPhone).length >= 7;
  const pinReady = /^\d{6}$/.test(pin);
  const pinConfirmReady = /^\d{6}$/.test(pinConfirm);
  const pinsMatch = pin === pinConfirm;
  const registerReady =
    phoneReady &&
    fullName.trim().length >= 2 &&
    aliasState === "free" &&
    pinReady &&
    pinConfirmReady &&
    pinsMatch;
  const loginReady = phoneReady && pinReady;

  if (step === "splash") {
    return (
        <RusherSplash phase={splashPhase} />
    );
  }

  if (step === "welcome") {
    return (
      <div className="rusher-in flex min-h-0 flex-1 flex-col px-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]" style={{ backgroundColor: "#0B0D0F", color: "#F5F7F2" }}>
        <RusherMark size={56} />
        <div className="mt-10 flex flex-1 flex-col">
          <h1 className="text-[40px] font-extrabold leading-[0.95] tracking-tight">Lánzate un Rush.</h1>
          <p className="mt-4 max-w-[28ch] text-[16px] font-semibold leading-snug" style={{ color: "var(--p-muted)" }}>
            Descubre experiencias, juega, compite y gana premios en el mundo real.
          </p>
          {hint && <p className="mt-4 text-[14px] font-extrabold" style={{ color: "var(--p-accent)" }}>{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => { setMode("register"); setStep("auth"); }}
          className="flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-extrabold tracking-wide text-[#0B0D0F]"
          style={{ backgroundColor: "#C8FF00" }}
        >
          COMENZAR →
        </button>
        <button
          type="button"
          onClick={() => { setMode("login"); setStep("auth"); }}
          className="mt-3 h-12 text-[14px] font-extrabold"
          style={{ color: "var(--p-muted)" }}
        >
          Ya tengo una cuenta
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ backgroundColor: "var(--p-bg)", color: "var(--p-text)" }}
    >
      <div className="flex items-center gap-2.5">
        <RusherMark size={40} />
        <p className="text-[18px] font-extrabold tracking-[0.16em]">RUSHER</p>
      </div>

      {mode === "choose" && (
        <div className="mt-10 flex flex-1 flex-col">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">¿Qué quieres hacer?</h1>
          {hint && (
            <p className="mt-3 text-[14px] font-extrabold" style={{ color: "var(--p-coral)" }}>
              {hint}
            </p>
          )}
          <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--p-muted)" }}>
            Una cuenta por teléfono. Entras con un PIN de 6 números.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => open("register")}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-extrabold text-[#0B0D0F]"
              style={{ backgroundColor: "var(--p-accent)", boxShadow: "0 12px 24px rgba(24,160,133,0.28)" }}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => open("login")}
              className="flex h-14 w-full items-center justify-center rounded-2xl border-2 bg-white text-[17px] font-extrabold"
              style={{ borderColor: "#2A2F33", color: "var(--p-text)" }}
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      )}

      {mode === "register" && (
        <form onSubmit={onRegister} className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
            <button type="button" onClick={() => setStep("welcome")} className="text-[13px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              ← Volver
            </button>
            <h1 className="text-[28px] font-extrabold leading-tight">Crea tu cuenta</h1>
            <p className="text-[14px] font-semibold" style={{ color: "var(--p-muted)" }}>Entra y lánzate un Rush.</p>
            <PhoneFields country={country} setCountry={setCountry} localPhone={localPhone} setLocalPhone={setLocalPhone} />
            <label className="block text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              Nombre completo
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                maxLength={80}
                placeholder="Vicente Martínez"
                className={fieldClass}
                style={{ borderColor: "#2A2F33" }}
              />
            </label>
            <label className="block text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              Alias
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value.replace(/\s/g, ""))}
                autoComplete="nickname"
                maxLength={20}
                placeholder="vicente2"
                className={fieldClass}
                style={{ borderColor: "#2A2F33" }}
              />
            </label>
            <AliasHint state={aliasState} />
            <label className="block text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              PIN
              <input
                value={pin}
                onChange={(event) => setPin(onlyDigits(event.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="••••••"
                type="password"
                className={fieldClass}
                style={{ borderColor: "#2A2F33", letterSpacing: "0.3em" }}
              />
            </label>
            <label className="block text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              Confirmar PIN
              <input
                value={pinConfirm}
                onChange={(event) => setPinConfirm(onlyDigits(event.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="••••••"
                type="password"
                className={fieldClass}
                style={{ borderColor: pinConfirmReady && !pinsMatch ? "#E23B2F" : "#2A2F33", letterSpacing: "0.3em" }}
              />
            </label>
            {pinConfirmReady && !pinsMatch && (
              <p className="text-[13px] font-bold text-[#E23B2F]">Los PIN no coinciden.</p>
            )}
            {authError && <p className="text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
            {switchHint === "login" && (
              <button type="button" onClick={() => open("login")} className="text-[14px] font-extrabold" style={{ color: "var(--p-accent)" }}>
                Iniciar sesión
              </button>
            )}
          </div>
          <FormSubmitBar pending={pending} pendingLabel="Creando cuenta…" label="Crear cuenta" disabled={!registerReady} />
        </form>
      )}

      {mode === "login" && (
        <form onSubmit={onLogin} className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
            <button type="button" onClick={() => setStep("welcome")} className="text-[13px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              ← Volver
            </button>
            <h1 className="text-[28px] font-extrabold leading-tight">Bienvenido a Rusher</h1>
            <p className="text-[14px] font-semibold" style={{ color: "var(--p-muted)" }}>Entra y lánzate un Rush.</p>
            <PhoneFields country={country} setCountry={setCountry} localPhone={localPhone} setLocalPhone={setLocalPhone} />
            <label className="block text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
              PIN
              <input
                value={pin}
                onChange={(event) => setPin(onlyDigits(event.target.value).slice(0, 6))}
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                placeholder="••••••"
                type="password"
                className={fieldClass}
                style={{ borderColor: "#2A2F33", letterSpacing: "0.3em" }}
              />
            </label>
            {authError && <p className="text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
            {switchHint === "register" && (
              <button type="button" onClick={() => open("register")} className="text-[14px] font-extrabold" style={{ color: "var(--p-accent)" }}>
                Crear cuenta
              </button>
            )}
          </div>
          <FormSubmitBar pending={pending} pendingLabel="Entrando…" label="Entrar" disabled={!loginReady} />
        </form>
      )}
    </div>
  );
}

function PhoneFields({
  country,
  setCountry,
  localPhone,
  setLocalPhone,
}: {
  country: (typeof COUNTRIES)[number];
  setCountry: (value: (typeof COUNTRIES)[number]) => void;
  localPhone: string;
  setLocalPhone: (value: string) => void;
}) {
  return (
    <>
      <label className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
        País
        <select
          value={country.iso}
          onChange={(event) => setCountry(COUNTRIES.find((item) => item.iso === event.target.value) ?? COUNTRIES[0])}
          className={fieldClass}
          style={{ borderColor: "#2A2F33" }}
        >
          {COUNTRIES.map((item) => (
            <option key={item.iso} value={item.iso}>
              {item.flag} {item.label} {item.dial}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-extrabold" style={{ color: "var(--p-muted)" }}>
        Número de teléfono
        <div className="mt-1 flex gap-2">
          <span className="flex h-14 items-center rounded-2xl border bg-[#14171A] px-3 text-[15px] font-extrabold" style={{ borderColor: "#2A2F33", color: "var(--p-accent)" }}>
            {country.dial}
          </span>
          <input
            value={localPhone}
            onChange={(event) => setLocalPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder={country.iso === "VE" ? "412 000 0000" : "Número"}
            className={`${fieldClass} mt-0 flex-1`}
            style={{ borderColor: "#2A2F33" }}
          />
        </div>
      </label>
    </>
  );
}

function FormSubmitBar({
  label,
  pendingLabel,
  pending,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div
      className="sticky bottom-0 -mx-5 shrink-0 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ borderColor: "#2A2F33", backgroundColor: "var(--p-bg)", boxShadow: "0 -12px 24px rgba(36,23,16,0.06)" }}
    >
      <button
        type="submit"
        disabled={pending || disabled}
        className="flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-extrabold text-[#0B0D0F] disabled:opacity-40"
        style={{ backgroundColor: "var(--p-accent)", boxShadow: pending || disabled ? undefined : "0 12px 24px rgba(24,160,133,0.28)" }}
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

function AliasHint({ state }: { state: "idle" | "checking" | "free" | "taken" | "invalid" }) {
  if (state === "checking") return <p className="text-[13px] font-bold" style={{ color: "var(--p-muted)" }}>Revisando alias...</p>;
  if (state === "free") return <p className="text-[13px] font-extrabold" style={{ color: "var(--p-accent)" }}>✓ Alias disponible</p>;
  if (state === "taken") return <p className="text-[13px] font-extrabold text-[#E23B2F]">Este alias ya está ocupado.</p>;
  if (state === "invalid") return <p className="text-[13px] font-bold" style={{ color: "var(--p-muted)" }}>De 3 a 20 letras, números o _.</p>;
  return null;
}
