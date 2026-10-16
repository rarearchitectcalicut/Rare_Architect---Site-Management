import rareLogo from "../assets/images/rare-logo.png";

export default function LoadingScreen({ message = "Loading..." }) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={message}
            className="
                fixed inset-0 z-9999
                flex min-h-dvh items-center justify-center
                bg-[#f1eadf]/40
                backdrop-blur-md
                px-6
            "
        >
            <div className="flex flex-col items-center justify-center gap-7">

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
        </div>
    );
}