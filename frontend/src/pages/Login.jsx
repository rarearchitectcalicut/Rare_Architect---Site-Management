
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { useAuth } from "../hooks/useAuth";

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
    <main className="min-h-screen lg:grid lg:grid-cols-[52.7%_47.3%]">
      {/* Left architectural panel */}
      <section
        className="relative hidden min-h-screen overflow-hidden lg:flex"
        style={{
          backgroundColor: "#292620",
        }}
      >
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent 40px,
                rgba(0,0,0,0.3) 41px,
                rgba(255,255,255,0.025) 42px
              )
            `,
          }}
        />

        <div className="relative z-10 mt-auto px-11 pb-12 xl:pb-14">
          <h1 className="max-w-lg text-[32px] font-bold leading-[1.15] tracking-tight text-white xl:text-[36px]">
            Every site. Every task.
            <br />
            One clear view.
          </h1>

          <p className="mt-4 max-w-sm text-[16px] leading-snug text-stone-300/80">
            RARE project and site management for admins
            and supervisors.
          </p>
        </div>
      </section>

      {/* Right authentication panel */}
      <section
        className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10"
        style={{ backgroundColor: "#f1eadf" }}
      >
        <div className="w-full max-w-[362px]">
          {/* Replace with the official company logo */}
          <div className="mb-9">
            <div className="inline-flex items-center gap-1">
              <span className="h-8 w-5 rounded-l-full bg-[#e60023]" />
              <span className="bg-[#f5c321] px-1 text-[32px] font-black leading-none tracking-[-2px] text-black">
                RARE
              </span>
              <span className="text-3xl font-light text-black">
                ▷
              </span>
            </div>
            <p className="ml-[74px] mt-0.5 text-[8px] font-medium tracking-tight">
              RIFATH ASSOCIATES LLP
            </p>
          </div>

          <header className="mb-4">
            <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.5px] text-[#211e1a]">
              Project &amp; Site
              <br />
              Management
            </h2>
            <p className="mt-2 text-sm text-[#8f877b]">
              Sign in to continue
            </p>
          </header>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="phone"
                className="mb-1.5 block text-sm font-medium text-[#8a8175]"
              >
                Phone Number
              </label>

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
                className="h-11 w-full rounded-xl border border-[#e4dccd] bg-[#fffdfa] px-4 text-[15px] text-[#29251f] outline-none transition placeholder:text-[#b0a99f] focus:border-[#292620] focus:ring-2 focus:ring-[#292620]/15 aria-invalid:border-red-600"
              />

              {errors.phone && (
                <p
                  id="phone-error"
                  role="alert"
                  className="mt-1 text-xs text-red-700"
                >
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[#8a8175]"
              >
                Password
              </label>

              <div className="relative">
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
                  className="h-11 w-full rounded-xl border border-[#e4dccd] bg-[#fffdfa] px-4 pr-12 text-[15px] text-[#29251f] outline-none transition placeholder:text-[#b0a99f] focus:border-[#292620] focus:ring-2 focus:ring-[#292620]/15 aria-invalid:border-red-600"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[#8a8175] hover:text-[#292620] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#292620]"
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>

              {errors.password && (
                <p
                  id="password-error"
                  role="alert"
                  className="mt-1 text-xs text-red-700"
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                {serverError}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#211e1a] px-4 text-[15px] font-semibold text-white transition hover:bg-[#38332c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211e1a] disabled:cursor-not-allowed disabled:opacity-60"
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
                  "Sign In"
                )}
              </button>
            </div>
          </form>

          <p className="mt-7 text-center text-xs text-[#9b9287] lg:hidden">
            RARE Project &amp; Site Management
          </p>
        </div>
      </section>
    </main>
  );
}
