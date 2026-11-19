import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const options = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
];
const subscribe = (listener) => {
    window.addEventListener("rare:appearance-updated", listener);
    return () => window.removeEventListener("rare:appearance-updated", listener);
};
const getSnapshot = () => document.documentElement.dataset.appearance || "light";
const getServerSnapshot = () => "light";
const changeAppearance = (value) => window.dispatchEvent(new CustomEvent("rare:appearance-change", { detail: value }));

export default function AppearancePreference({ compact = false }) {
    const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const dark = preference === "dark";
    const Icon = dark ? Sun : Moon;
    const label = dark ? "Switch to light mode" : "Switch to dark mode";

    if (compact) return <button type="button" className="rare-appearance-quick" aria-label={label} title={label} onClick={() => changeAppearance(dark ? "light" : "dark")}>
        <Icon size={19} aria-hidden="true" />
    </button>;

    return <section className="rare-appearance-card" aria-labelledby="appearance-heading">
        <div>
            <h2 id="appearance-heading">Appearance</h2>
            <p>Choose a light or dark workspace.</p>
        </div>
        <fieldset className="rare-appearance-options">
            <legend className="sr-only">Workspace appearance</legend>
            {options.map(({ value, label, Icon: OptionIcon }) => <label key={value} className="rare-appearance-option">
                <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => changeAppearance(value)} />
                <span><OptionIcon size={20} aria-hidden="true" />{label}</span>
            </label>)}
        </fieldset>
        <p className="rare-appearance-note">Saved on this device.</p>
    </section>;
}
