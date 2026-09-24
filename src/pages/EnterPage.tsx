import { useState, type FormEvent } from "react";
import { PrimaryButton } from "@/components/ui/Buttons";
import { LogoMark } from "@/components/ui/LogoMark";
import { usePulse } from "@/state/PulseContext";

export function EnterPage() {
  const { register, login, authError } = usePulse();
  const [mode, setMode] = useState<"new" | "back">("new");
  const [phone, setPhone] = useState("");
  const [alias, setAlias] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "new") await register(phone, alias);
      else await login(phone, accessCode);
    } catch {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <p className="text-[18px] font-extrabold tracking-tight">Pulse</p>
      </div>
      <h1 className="mt-8 text-[32px] font-extrabold leading-tight tracking-tight">
        {mode === "new" ? "Crea tu perfil" : "Entra en este teléfono"}
      </h1>
      <p className="mt-2 text-[14px] font-semibold text-[#8D7366]">
        {mode === "new"
          ? "Tu celular queda privado. En el ranking solo se ve tu alias."
          : "Usa el mismo número y la clave que aparece en tu perfil."}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col gap-3">
        <label className="text-[12px] font-extrabold text-[#A08B80]">
          Celular
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0412 000 0000"
            className="mt-1 h-14 w-full rounded-2xl border-2 border-[#F3E4D8] bg-white px-4 text-[16px] font-bold text-[#241710] outline-none focus:border-[#FF4F1A]"
          />
        </label>
        {mode === "new" ? (
          <label className="text-[12px] font-extrabold text-[#A08B80]">
            Alias público
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              autoComplete="nickname"
              placeholder="Cómo te ven en el ranking"
              className="mt-1 h-14 w-full rounded-2xl border-2 border-[#F3E4D8] bg-white px-4 text-[16px] font-bold text-[#241710] outline-none focus:border-[#FF4F1A]"
            />
          </label>
        ) : (
          <label className="text-[12px] font-extrabold text-[#A08B80]">
            Clave
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="La de tu perfil"
              className="mt-1 h-14 w-full rounded-2xl border-2 border-[#F3E4D8] bg-white px-4 text-[16px] font-extrabold tracking-[0.2em] text-[#241710] outline-none focus:border-[#FF4F1A]"
            />
          </label>
        )}
        {authError && <p className="text-[13px] font-bold text-[#E23B2F]">{authError}</p>}
        <div className="mt-auto">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Entrando…" : mode === "new" ? "Crear perfil" : "Entrar"}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => setMode(mode === "new" ? "back" : "new")}
            className="mt-4 w-full text-center text-[14px] font-extrabold text-[#FF4F1A]"
          >
            {mode === "new" ? "Ya tengo perfil" : "Crear un perfil nuevo"}
          </button>
        </div>
      </form>
    </div>
  );
}
