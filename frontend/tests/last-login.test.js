import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";
import { formatLastLogin } from "../src/utils/lastLogin.js";

test("last login includes date and time in the browser locale and timezone", () => {
    const value = "2026-11-09T05:12:12Z";
    assert.equal(formatLastLogin(value), new Date(value).toLocaleString(undefined, {
        dateStyle: "medium", timeStyle: "short",
    }));
    assert.equal(formatLastLogin(null), "Never");
    assert.equal(formatLastLogin(undefined), "Never");
    assert.equal(formatLastLogin("invalid"), "Not available");
});

for (const [role, entry] of [
    ["ADMIN", "components/settings/AccountProfile.jsx"],
    ["SUPERVISOR", "pages/supervisor/Settings.jsx"],
]) {
    test(`${role} settings displays the API last_login and handles never logged in`, async () => {
        for (const last_login of ["2026-11-09T05:12:12Z", null]) {
            const profile = { username: "test", first_name: "Test", role, last_login };
            const { exports } = await loadSource(entry, { overrides: {
                react: { ...React,
                    useState: (initial) => [initial === null ? profile : ["Loading your profile...", "Loading your account settings..."].includes(initial) ? "" : initial, () => {}],
                    useEffect: () => {},
                },
                "hooks/useAuth.js": { useAuth: () => ({ reloadUser() {} }) },
                "components/settings/ChangePasswordForm.jsx": { default: () => null },
                "components/settings/PushPreferences.jsx": { default: () => null },
            } });
            const html = renderToStaticMarkup(React.createElement(exports.default, { role }));
            assert.match(html, /Last Login/);
            assert.ok(html.includes(formatLastLogin(last_login)));
            assert.ok(!html.includes('name="last_login"'));
        }
    });
}
