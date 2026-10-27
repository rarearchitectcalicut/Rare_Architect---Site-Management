
import { useLocation } from "react-router-dom";
import {
    Construction,
    ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import {
    getDashboardPath,
    getNavigation,
} from "../config/navigation";

export default function SectionPlaceholder() {
    const { user } = useAuth();
    const location = useLocation();

    const section = getNavigation(user.role).find(
        (item) => item.path === location.pathname
    );

    const title = section?.label || "Section";

    return (
        <div
            className="
        rounded-[24px]
        border border-[#e6ddcf]
        bg-[#fffdfa]
        px-6 py-14
        text-center
        sm:px-10
      "
        >
            <div
                className="
          mx-auto mb-5 flex h-16 w-16
          items-center justify-center
          rounded-2xl
          bg-[#f1eadf]
          text-[#211e1a]
        "
            >
                <Construction size={28} strokeWidth={1.7} />
            </div>

            <h2 className="text-2xl font-bold text-[#211e1a]">
                {title}
            </h2>

            <p
                className="
          mx-auto mt-3 max-w-md
          text-sm leading-6
          text-[#716658]
        "
            >
                The {title.toLowerCase()} interface will be
                connected to your existing RARE backend API
                in an upcoming frontend module.
            </p>

            <Link
                to={getDashboardPath(user.role)}
                className="
          mx-auto mt-7 inline-flex
          items-center gap-2
          rounded-xl bg-[#211e1a]
          px-5 py-3
          text-sm font-semibold text-white
          hover:bg-[#38332c]
        "
            >
                <ArrowLeft size={17} />
                Back to Dashboard
            </Link>
        </div>
    );
}
