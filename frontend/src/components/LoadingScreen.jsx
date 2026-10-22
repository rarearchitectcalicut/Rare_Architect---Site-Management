import { createPortal } from "react-dom";
import loginBg from "../assets/images/login-bg.jpg";
import rareLogo from "../assets/images/rare-logo.png";

export default function LoadingScreen({ message = "Loading...", standalone = false }) {
    return createPortal(
        <div
            role="status"
            aria-live="polite"
            aria-label={message}
            className="
                fixed inset-0 z-9999 isolate
                flex min-h-dvh items-center justify-center
                px-6
            "
        >
            {standalone && (
                <img
                    src={loginBg}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 -z-20 h-full w-full object-cover"
                />
            )}
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-[#f1eadf]/40 backdrop-blur-xl backdrop-saturate-125"
            />
            <div className="flex max-w-full flex-col items-center justify-center gap-7">

                {/* Centered RARE Logo */}
                <img
                    src={rareLogo}
                    alt="RARE - Rifath Associates LLP"
                    className="h-auto w-44 object-contain sm:w-48"
                />

                {/* Smooth wave dots */}
                <div
                    className="flex h-8 items-center justify-center gap-3"
                    aria-hidden="true"
                >
                    {[0, 1, 2].map((i) => (
                        <span
                            key={i}
                            className="loading-dot h-3 w-3 rounded-full bg-[#211e1a]"
                            style={{ animationDelay: `${i * -0.2}s` }}
                        />
                    ))}
                </div>

                {/* Loading Message */}
                <p className="text-center text-sm font-medium text-[#494239]">
                    {message}
                </p>

            </div>
        </div>,
        document.body
    );
}
