
import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";

import {
    getMobilePrimaryNavigation,
} from "../../config/navigation";

import NavIcon from "./NavIcon";

export default function MobileBottomNav({
    role,
    onOpenMore,
    moreOpen,
}) {
    const location = useLocation();
    const items = getMobilePrimaryNavigation(role);

    const primaryPaths = items.map((item) => item.path);

    const isMoreActive =
        moreOpen ||
        !primaryPaths.includes(location.pathname);

    return (
        <nav
            aria-label="Mobile navigation"
            className="
        fixed right-4 left-4 z-40
        lg:hidden
      "
            style={{
                bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            }}
        >
            <div
                className="
          grid grid-cols-5 gap-1
          rounded-[32px]
          border border-[#e4dccd]
          bg-[#fffdfa]/95
          p-2
          shadow-[0_12px_35px_rgba(33,30,26,0.14)]
          backdrop-blur-xl
        "
            >
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `
                flex min-h-14 flex-col
                items-center justify-center
                gap-1 rounded-[24px]
                px-1 py-2
                transition-colors
                ${isActive
                                ? "bg-[#211e1a] text-white"
                                : "text-[#776d61] hover:bg-[#f1eadf]"
                            }
              `
                        }
                    >
                        <NavIcon name={item.icon} size={20} />

                        <span className="text-[10px] font-medium">
                            {item.label}
                        </span>
                    </NavLink>
                ))}

                <button
                    type="button"
                    onClick={onOpenMore}
                    aria-expanded={moreOpen}
                    aria-controls="rare-mobile-more-sheet"
                    className={`
            flex min-h-14 flex-col
            items-center justify-center
            gap-1 rounded-[24px]
            px-1 py-2
            transition-colors
            ${isMoreActive
                            ? "bg-[#211e1a] text-white"
                            : "text-[#776d61] hover:bg-[#f1eadf]"
                        }
          `}
                >
                    <Menu size={20} strokeWidth={1.9} />

                    <span className="text-[10px] font-medium">
                        More
                    </span>
                </button>
            </div>
        </nav>
    );
}
