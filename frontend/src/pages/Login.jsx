import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  FolderKanban,
  LoaderCircle,
  LockKeyhole,
  Phone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import loginBg from "../assets/images/login-bg.jpg";
import rareLogo from "../assets/images/rare-logo.png";
import { useAuth } from "../hooks/useAuth";
import LoadingScreen from "../components/LoadingScreen";

// =====================================================
// MOTION + STYLES
// =====================================================

const loginCss = `
  @keyframes rare-rise {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes rare-zoom {
    from { transform: scale(1.07); }
    to   { transform: scale(1); }
  }

  .rare-rise {
    animation: rare-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-fade {
    animation: rare-fade 900ms ease-out backwards;
    animation-delay: var(--d, 0ms);
  }

  .rare-zoom {
    animation: rare-zoom 2200ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-rise,
    .rare-fade,
    .rare-zoom {
      animation: none !important;
    }
  }
`;

const inputClass = `
  h-12 w-full rounded-xl
  border border-[#e4dccd] bg-[#fffdfa]
  pl-11 pr-4 text-[15px] text-[#29251f]
  outline-none transition-all duration-200
  placeholder:text-[#b0a99f]
  hover:border-[#cfc4b5]
  focus:border-[#292620]
  focus:ring-4 focus:ring-[#292620]/10
  disabled:cursor-not-allowed disabled:opacity-60
  aria-invalid:border-red-600
  aria-invalid:ring-4 aria-invalid:ring-red-600/10
`;

const highlights = [
  { icon: FolderKanban, label: "Projects" },
  { icon: ClipboardCheck, label: "Daily reports" },
  { icon: UsersRound, label: "Teams" },
];

// =====================================================
// VALIDATION + ERRORS
// =====================================================

const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(
      /^\+?[0-9]{7,15}$/,
      "Enter a valid phone number"
    ),
  password: z
    .string()
    .min(1, "Password is required"),
});

function getErrorMessage(error) {
  const status = error.response?.status;

  if (status === 400 || status === 401) {
    return "Invalid phone number or password.";
  }

  if (status === 403) {
    return "Your account does not have permission to sign in.";
  }

  if (status === 429) {
    return "Too many attempts. Please try again later.";
  }

  if (status >= 500) {
    return "Server error. Please try again later.";
  }

  if (!error.response) {
    return "Unable to reach the server. Check your connection.";
  }

  return "Sign in failed. Please try again.";
}

function FieldError({ id, message }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-xs text-red-700"
    >
      <AlertCircle size={14} className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

// =====================================================
// LOGIN PAGE
// =====================================================

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values) => {
    setServerError("");

    try {
      const user = await login(values.phone, values.password);

      if (user.must_change_password) {
        navigate("/change-password", { replace: true });
        return;
      }

      if (user.role === "ADMIN") {
        navigate("/admin/dashboard", { replace: true });
      } else if (user.role === "SUPERVISOR") {
        navigate("/supervisor/dashboard", { replace: true });
      }
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  };

  return (
    <>
      <style>{loginCss}</style>

      {loading && (
        <LoadingScreen message="Signing you in..." />
      )}

      <main className="min-h-dvh lg:grid lg:grid-cols-[50%_50%]">
        {/* ============================================= */}
        {/* LEFT: ARCHITECTURAL PANEL                      */}
        {/* ============================================= */}
        <section className="relative hidden min-h-dvh overflow-hidden bg-[#211e1a] lg:flex">
          {/* Background image */}
          <img
            src={loginBg}
            alt="RARE Architecture"
            className="rare-zoom absolute inset-0 h-full w-full object-cover object-center"
          />

          {/* Legibility overlays */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-t from-[#211e1a]/90 via-[#211e1a]/35 to-[#211e1a]/10"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-r from-[#211e1a]/30 to-transparent"
          />

          {/* Top badge */}
          <div
            className="rare-fade absolute left-11 top-10 z-10 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur-md"
            style={{ "--d": "300ms" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
            Project &amp; Site Management
          </div>

          {/* Bottom content */}
          <div className="relative z-10 mt-auto px-11 pb-12 xl:pb-14">
            <h1
              className="rare-rise max-w-lg text-[32px] font-bold leading-[1.15] tracking-tight text-white xl:text-[40px]"
              style={{ "--d": "200ms" }}
            >
              Every site. Every task.
              <br />
              One clear view.
            </h1>

            <p
              className="rare-rise mt-4 max-w-sm text-[16px] leading-snug text-white/85"
              style={{ "--d": "300ms" }}
            >
              RARE project and site management for admins
              and supervisors.
            </p>

            <div
              className="rare-rise mt-7 flex flex-wrap gap-2.5"
              style={{ "--d": "420ms" }}
            >
              {highlights.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="
                    group inline-flex items-center gap-2 rounded-full
                    bg-white/10 px-3.5 py-2 text-xs font-semibold text-white
                    ring-1 ring-white/20 backdrop-blur-md
                    transition-all duration-300 ease-out
                    hover:-translate-y-0.5 hover:bg-white/20
                    motion-reduce:transition-none
                    motion-reduce:hover:translate-y-0
                  "
                >
                  <Icon size={15} strokeWidth={1.9} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================= */}
        {/* RIGHT: AUTHENTICATION PANEL                    */}
        {/* ============================================= */}
        <section className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#f1eadf] px-4 py-10 sm:px-8 lg:px-10">
          {/* Soft decorative background */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#e8dfd3] blur-3xl" />
            <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#fffdfa]/70 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "radial-gradient(#d9cfc0 1px, transparent 1px)",
                backgroundSize: "22px 22px",
                maskImage:
                  "radial-gradient(ellipse at center, black 30%, transparent 75%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              }}
            />
          </div>

          <div className="relative w-full max-w-105">
            {/* Logo and heading */}
            <div
              className="rare-rise mb-6 flex flex-col items-center text-center"
              style={{ "--d": "80ms" }}
            >
              <img
                src={rareLogo}
                alt="RARE - Rifath Associates LLP"
                className="mb-3 h-auto w-44 object-contain sm:w-48"
              />

              <h1 className="text-[28px] font-bold tracking-tight text-[#211e1a] sm:text-[30px]">
                Welcome Back
              </h1>

              <p className="mt-1 text-sm leading-6 text-[#8a8175]">
                Sign in to your RARE account
              </p>
            </div>

            {/* Card */}
            <div
              className="
                rare-rise rounded-[28px] border border-[#e8dfd3]
                bg-[#fffdfa] p-5
                shadow-[0_20px_60px_rgba(33,30,26,0.10)]
                sm:p-8
              "
              style={{ "--d": "160ms" }}
            >
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="flex flex-col gap-5"
              >
                {/* Phone Number */}
                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="block text-[13px] font-semibold text-[#665e53]"
                  >
                    Phone Number
                  </label>

                  <div className="group relative">
                    <Phone
                      size={17}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#938778] transition-colors duration-200 group-focus-within:text-[#211e1a]"
                    />

                    <input
                      id="phone"
                      type="tel"
                      placeholder="Enter your phone number"
                      autoComplete="tel"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={
                        errors.phone ? "phone-error" : undefined
                      }
                      {...register("phone")}
                      className={inputClass}
                    />
                  </div>

                  {errors.phone && (
                    <FieldError
                      id="phone-error"
                      message={errors.phone.message}
                    />
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-semibold text-[#665e53]"
                  >
                    Password
                  </label>

                  <div className="group relative">
                    <LockKeyhole
                      size={17}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#938778] transition-colors duration-200 group-focus-within:text-[#211e1a]"
                    />

                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={
                        errors.password ? "password-error" : undefined
                      }
                      {...register("password")}
                      className={`${inputClass} pr-12`}
                    />

                    {/* Show / Hide Password */}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="
                        absolute right-2.5 top-1/2 -translate-y-1/2
                        rounded-lg p-1.5 text-[#8a8175]
                        transition-all duration-200
                        hover:bg-[#f1eadf] hover:text-[#292620]
                        active:scale-90
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-[#292620]/40
                      "
                    >
                      {showPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </div>

                  {errors.password && (
                    <FieldError
                      id="password-error"
                      message={errors.password.message}
                    />
                  )}
                </div>

                {/* Server Error */}
                {serverError && (
                  <div
                    role="alert"
                    className="rare-fade flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    <AlertCircle
                      size={18}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0 wrap-break-word">
                      {serverError}
                    </span>
                  </div>
                )}

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="
                    group mt-1 flex h-12 items-center justify-center gap-2
                    rounded-xl bg-[#211e1a] px-4
                    text-[15px] font-semibold text-white
                    shadow-[0_8px_20px_rgba(33,30,26,0.18)]
                    transition-all duration-200 ease-out
                    hover:-translate-y-0.5 hover:bg-[#38332c]
                    hover:shadow-[0_12px_28px_rgba(33,30,26,0.26)]
                    active:translate-y-0 active:scale-[0.98]
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[#211e1a]/40 focus-visible:ring-offset-2
                    disabled:pointer-events-none disabled:opacity-60
                    motion-reduce:transition-none
                    motion-reduce:hover:translate-y-0
                  "
                >
                  {loading ? (
                    <>
                      <LoaderCircle
                        className="animate-spin"
                        size={18}
                      />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight
                        size={18}
                        className="
                          transition-transform duration-300 ease-out
                          group-hover:translate-x-1
                          motion-reduce:transition-none
                          motion-reduce:group-hover:translate-x-0
                        "
                      />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Footer */}
            <div
              className="rare-fade mt-6 flex flex-col items-center gap-2 text-center"
              style={{ "--d": "500ms" }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-3 py-1 text-[11px] font-semibold text-[#246b3b]">
                <ShieldCheck size={13} />
                Secure access for authorised staff
              </span>

              <p className="text-xs text-[#9b9287]">
                RARE Project &amp; Site Management
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}