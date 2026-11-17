// Isolated visual fixture; not imported by the production application.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import HorizontalProjectCard from "../../src/components/projects/HorizontalProjectCard";
import ProjectInformationCard from "../../src/components/projects/ProjectInformationCard";
import AdminTaskCard, { MobileTaskCard } from "../../src/components/admin/tasks/AdminTaskCard";
import AdminTaskOverview from "../../src/components/admin/tasks/AdminTaskOverview";
import "../../src/index.css";

const base = { id: "qa", name: "Lake House", category_name: "Residential", client_name: "Aarav & Meera", location: "Kochi, Kerala", status: "ACTIVE", start_date: "2026-10-01", end_date: "2026-12-31" };
const projects = [base, { ...base, id: "qa-long", name: "North Wing — Architectural Coordination & Construction Documentation", client_name: "A client organisation with a considerably longer registered name", location: "A location with a long building, neighbourhood and district name", status: "ON_HOLD", cover_image: "/media/qa-broken-cover.jpg" }, { id: "qa-missing", name: "New project", status: "CANCELLED" }];
const task = { id: "qa-task", project_name: "Lake House", title: "Ground-floor blockwork", priority: "HIGH", approval_status: "APPROVED", work_status: "IN_PROGRESS", worker_name: "Blockwork team", description: "Check the approved drawing and record measured wall area before submitting work.", display_order: 3, start_date: "2026-11-01", end_date: "2026-12-01", measurement_method: "QUANTITY", planned_quantity: "100", measurement_unit: "SQM", progress: { measurement_method: "QUANTITY", planned_quantity: "100", verified_quantity: "20", pending_quantity: "10", measurement_unit: "SQM", progress_percentage: 20 } };
const tasks = [task, { ...task, id: "qa-long-task", title: "Inspect and verify reinforcement throughout the entire north-east foundation before concrete placement", worker_name: "TeamWithAnUnusuallyLongUnbrokenNameToCheckWrapping", priority: "URGENT", approval_status: "REJECTED", work_status: "NOT_STARTED", is_overdue: true, progress: null }, { id: "qa-missing-task", title: "Prepare the next site inspection", approval_status: "PENDING", work_status: "NOT_STARTED", priority: "LOW" }];
export default function Fixture() {
    return <MemoryRouter><div className="rare-app"><main className="mx-auto max-w-[1440px] space-y-8 p-4 sm:p-8">
        <h1>Information cards · visual QA</h1>
        <section aria-label="Project card grid" className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <HorizontalProjectCard key={project.id} project={project} layout="grid" to="/project" />)}</section>
        <section aria-label="Project card list" className="grid gap-4"><HorizontalProjectCard project={projects[1]} layout="list" to="/project" /></section>
        <ProjectInformationCard project={projects[1]} supervisorCount={2} />
        <section aria-label="Task card grid" className="rare-tasks grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tasks.map((record) => <AdminTaskCard key={record.id} task={record} showProject to="/task" approvalTo={record.approval_status === "PENDING" ? "/approval" : undefined} />)}</section>
        <section aria-label="Compact tasks" className="grid gap-4 md:grid-cols-2">{tasks.map((record) => <MobileTaskCard key={record.id} task={record} to="/task" mobilePresentation="gallery" />)}</section>
        <AdminTaskOverview task={task} />
    </main></div></MemoryRouter>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
