import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, CalendarCheck2, MapPin, UserRound } from "lucide-react";
import { getMediaUrl } from "../../utils/mediaUrl";
import { InfoField } from "../common/InfoCard";
import { projectDate } from "./projectPresentation";
import { ProjectStatus } from "./ProjectStatus";
export { ProjectStatus } from "./ProjectStatus";

export default function HorizontalProjectCard({ project, categoryName, to, layout = "list", actionLabel = "View Project" }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const imageUrl = getMediaUrl(project.cover_image);
    return <Link to={to || `/admin/projects/${project.id}`} aria-label={`Open project: ${project.name}`}
        className="rare-project-card group" data-layout={layout}>
        <div className="rare-project-card-cover">
            {imageUrl && failedUrl !== imageUrl
                ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} />
                : <div className="rare-project-cover" aria-hidden="true"><span><Building2 size={30} strokeWidth={1.3} /></span></div>}
            <span className="rare-project-mobile-open" aria-hidden="true"><ArrowUpRight size={13} /></span>
        </div>
        <div className="rare-project-card-body">
            <div className="rare-project-card-context"><p>{project.category_name || categoryName || "Project"}</p><ProjectStatus status={project.status} /></div>
            <h3>{project.name}</h3>
            <p className="rare-project-card-location"><MapPin size={15} aria-hidden="true" /><span>{project.location || "Location not specified"}</span></p>
            <dl className="rare-info-grid">
                <InfoField className="rare-project-card-client" icon={UserRound} label="Client" value={project.client_name} />
                <InfoField icon={CalendarDays} label="Start date" value={projectDate(project.start_date)} />
                <InfoField icon={CalendarCheck2} label="Expected completion" value={projectDate(project.end_date)} />
            </dl>
            <div className="rare-project-card-footer"><span>Project workspace</span><span className="rare-project-card-action">{actionLabel}<ArrowUpRight size={16} aria-hidden="true" /></span></div>
        </div>
    </Link>;
}
