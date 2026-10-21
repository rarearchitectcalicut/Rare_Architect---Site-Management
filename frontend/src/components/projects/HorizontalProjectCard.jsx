
import { useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    CalendarDays,
    ImageOff,
    MapPin,
    UserRound,
} from "lucide-react";

import { getMediaUrl } from "../../utils/mediaUrl";

// =====================================================
// HELPERS
// =====================================================

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}

function ProjectStatus({ status }) {
    const value = String(status || "UNKNOWN").toUpperCase();

    const styles = {
        ACTIVE: "bg-[#E7F2E8] text-[#2D7243]",
        MAINTENANCE: "bg-[#FFF0CE] text-[#94691B]",
        COMPLETED: "bg-[#E7F2E8] text-[#2D7243]",
        ON_HOLD: "bg-[#FDE8E4] text-[#A44837]",
        CANCELLED: "bg-[#EEE9E2] text-[#796D61]",
    };

    return (
        <span
            className={`
        inline-flex items-center
        rounded-full px-3 py-1.5
        text-[10px] font-bold
        uppercase tracking-wide
        ${styles[value] || "bg-[#EEE9E2] text-[#796D61]"}
      `}
        >
            {value.replaceAll("_", " ")}
        </span>
    );
}

function Detail({ icon: Icon, label, value }) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 shrink-0 text-[#928577]">
                <Icon size={16} strokeWidth={1.8} />
            </div>

            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#978C7E]">
                    {label}
                </p>

                <p className="mt-1 wrap-break-word text-xs font-medium text-[#3C352D] sm:text-sm">
                    {value || "Not specified"}
                </p>
            </div>
        </div>
    );
}

// =====================================================
// HORIZONTAL PROJECT CARD
// =====================================================

export default function HorizontalProjectCard({
    project,
    categoryName,
}) {
    const [imageFailed, setImageFailed] = useState(false);

    const imageUrl = getMediaUrl(project.cover_image);
    const showImage = imageUrl && !imageFailed;

    return (
        <Link
            to={`/admin/projects/${project.id}`}
            className="
            
        group block overflow-hidden
        rounded-3xl
        border border-[#E7DED2]
        bg-[#FFFDFA]
        shadow-[0_3px_16px_rgba(33,30,26,0.025)]
        transition-all duration-300
        hover:-translate-y-0.5
        hover:border-[#C9BAA8]
        hover:shadow-[0_14px_34px_rgba(33,30,26,0.09)]
        focus-visible:outline-2
        focus-visible:outline-offset-3
        focus-visible:outline-[#211E1A]
      "
            aria-label={`View project ${project.name}`}
        >
            <div className="flex min-h-60 items-stretch sm:min-h-70 lg:min-h-75">

                {/* =====================================
            LARGE COVER IMAGE — LEFT
            ===================================== */}

                <div
                    className="
            relative w-[39%] shrink-0
            overflow-hidden bg-[#E8DFD3]
            sm:w-[40%]
          "
                >
                    {showImage ? (
                        <img
                            src={imageUrl}
                            alt={`${project.name} project cover`}
                            loading="lazy"
                            onError={() => setImageFailed(true)}
                            className="
                absolute inset-0 h-full w-full
                object-cover object-center
                transition-transform duration-500
                group-hover:scale-105
              "
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center">
                            <ImageOff
                                size={30}
                                strokeWidth={1.4}
                                className="text-[#938676]"
                            />

                            <span className="text-[11px] text-[#938676]">
                                No project image
                            </span>
                        </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent to-black/5" />
                </div>

                {/* =====================================
            PROJECT INFORMATION — RIGHT
            ===================================== */}

                <div
                    className="
            flex min-w-0 flex-1 flex-col
            justify-between gap-4
            p-3.5
            sm:p-6
            lg:p-7
          "
                >

                    {/* TOP DETAILS */}
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#918576]">
                                {project.category_name ||
                                    categoryName ||
                                    "Project"}
                            </span>

                            <ProjectStatus status={project.status} />
                        </div>

                        <h3
                            className="
                mt-3 wrap-break-word
                text-base font-bold
                leading-snug tracking-tight
                text-[#211E1A]
                sm:text-xl
                lg:text-2xl
              "
                        >
                            {project.name}
                        </h3>

                        <div className="mt-2 flex items-start gap-1.5 text-[#817669]">
                            <MapPin
                                size={15}
                                className="mt-0.5 shrink-0"
                            />

                            <span className="wrap-break-word text-xs sm:text-sm">
                                {project.location || "Location not specified"}
                            </span>
                        </div>
                    </div>

                    {/* STRUCTURED DETAILS */}
                    <div className="space-y-3 border-t border-[#F0E9DF] pt-3 sm:space-y-4 sm:pt-4">
                        <Detail
                            icon={UserRound}
                            label="Client"
                            value={project.client_name}
                        />

                        <div className="hidden sm:block">
                            <Detail
                                icon={CalendarDays}
                                label="Project Timeline"
                                value={`${formatDate(project.start_date)} — ${formatDate(project.end_date)}`}
                            />
                        </div>

                        {/* Compact date information on mobile */}
                        <div className="sm:hidden">
                            <Detail
                                icon={CalendarDays}
                                label="Expected Completion"
                                value={formatDate(project.end_date)}
                            />
                        </div>
                    </div>

                    {/* VIEW PROJECT ACTION */}
                    <div
                        className="
              flex items-center justify-between
              border-t border-[#F0E9DF]
              pt-3 sm:pt-4
            "
                    >
                        <span className="text-xs font-bold text-[#211E1A] sm:text-sm">
                            View Project
                        </span>

                        <span
                            className="
                flex h-8 w-8 items-center justify-center
                rounded-full bg-[#F1EADF]
                text-[#211E1A]
                transition-colors
                group-hover:bg-[#211E1A]
                group-hover:text-white
                sm:h-10 sm:w-10
              "
                        >
                            <ArrowUpRight size={19} />
                        </span>
                    </div>

                </div>
            </div>
        </Link>
    );
}
