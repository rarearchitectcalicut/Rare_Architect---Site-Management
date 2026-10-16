
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import loginBg from "../assets/images/login-bg.jpg";
import rareLogo from "../assets/images/rare-logo.png"
import { useAuth } from "../hooks/useAuth";
import LoadingScreen from "../components/LoadingScreen";

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
    <>
      {loading && (
        <LoadingScreen message="Signing you in..." />
      )}
    <main className="min-h-screen lg:grid lg:grid-cols-[50%_50%]">
      {/* Left architectural panel */}
      <section className="relative hidden min-h-screen overflow-hidden lg:flex">
        {/* Full background image */}
        <img
          src={loginBg}
          alt="RARE Architecture"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        {/* Bottom text */}
        <div className="relative z-10 mt-auto px-11 pb-12 xl:pb-14">
          <h1 className="max-w-lg text-[32px] font-bold leading-[1.15] tracking-tight text-white xl:text-[36px]">
            Every site. Every task.
            <br />
            One clear view.
          </h1>

          <p className="mt-4 max-w-sm text-[16px] leading-snug text-white">
            RARE project and site management for admins
            and supervisors.
          </p>
        </div>
      </section>

      {/* Right authentication panel */}

      <section
        className="flex min-h-screen items-center justify-center bg-[#f1eadf] px-5 py-12 sm:px-8 lg:px-10"
      >
        <div className="w-full max-w-95">

          {/* Logo and heading */}
          <div className="mb-5 flex flex-col items-center text-center">

            {/* RARE Logo */}
            <img
              src={rareLogo}
              alt="RARE - Rifath Associates LLP"
              className="mb-2 h-auto w-44 object-contain sm:w-48"
            />

            {/* Heading */}
            <h1 className="text-[28px] font-bold tracking-tight text-[#211e1a] sm:text-[30px]">
              Welcome Back
            </h1>

            {/* Subtitle */}
            <p className=" text-sm leading-6 text-[#8a8175]">
              Sign in to your RARE account
            </p>

          </div>

          {/* Login Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-5"
          >

            {/* Phone Number */}
            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-[#665e53]"
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
                className="h-12 w-full rounded-xl border border-[#e4dccd] bg-[#fffdfa] px-4 text-[15px] text-[#29251f] outline-none transition-colors placeholder:text-[#b0a99f] focus:border-[#292620] focus:ring-2 focus:ring-[#292620]/15 aria-invalid:border-red-600"
              />

              {errors.phone && (
                <p
                  id="phone-error"
                  role="alert"
                  className="text-xs text-red-700"
                >
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#665e53]"
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
                  className="h-12 w-full rounded-xl border border-[#e4dccd] bg-[#fffdfa] px-4 pr-12 text-[15px] text-[#29251f] outline-none transition-colors placeholder:text-[#b0a99f] focus:border-[#292620] focus:ring-2 focus:ring-[#292620]/15 aria-invalid:border-red-600"
                />

                {/* Show / Hide Password */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#8a8175] transition hover:text-[#292620] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#292620]"
                >
                  {showPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>

              {errors.password && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-xs text-red-700"
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Server Error */}
            {serverError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {serverError}
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12  items-center justify-center gap-2 rounded-xl bg-[#211e1a] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#38332c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211e1a] disabled:cursor-not-allowed disabled:opacity-60"
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

          </form>

          {/* Footer */}
          <p className="mt-10 text-center text-xs text-[#9b9287]">
            RARE Project &amp; Site Management
          </p>

        </div>
      </section>

    </main>

    </>
  );
}
