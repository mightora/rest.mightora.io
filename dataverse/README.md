# Mightora REST Studio – Dataverse Web Resource

## What this package contains

- `rest.html`: standalone Dataverse **Webpage (HTML)** web resource.
- `mightora_rest_command.js`: optional JavaScript command-bar launcher.
- This README and the MIT licence.

**This ZIP is a set of web-resource files, NOT an importable managed or unmanaged Dataverse solution.**

The HTML contains Mightora branding, its CSS, the REST workspace, and shared Swagger 2.0 support. It does not load any Mightora-hosted JavaScript or CSS at runtime.

The sole platform-supplied dependency is `ClientGlobalContext.js.aspx`, which Microsoft provides from the **same Dataverse origin** when the HTML runs as a web resource. Microsoft recommends this helper because `parent.Xrm` is not supported when a web resource runs as an app-navigation page. Do not upload a copy of this Microsoft script and do not use the HTML as an untrusted public website.

## Installation in a model-driven Power App

1. Download `rest.html` or extract it from `rest-Dataverse.zip`.
2. Go to [Power Apps](https://make.powerapps.com), choose the correct Dataverse environment, open **Solutions**, and open an **unmanaged solution**.
3. Choose **New → More → Web resource**, give the resource a friendly display name such as **Mightora REST Studio**, choose **Webpage (HTML)** and upload `rest.html`. The resulting web resource has a publisher prefix, such as `new_rest.html`. Avoid adding virtual folders to its name unless you also adapt the Microsoft global-context script path.
4. **Save and Publish** the web resource.
5. Edit your model-driven app. Add a new **Web resource** page/subarea in the app navigation, select the newly published HTML, and switch **Show in navigation** on.
6. Give the page a title such as **REST Studio**, then save and publish the app.
7. Open that app while signed in with a user who has the required Dataverse privileges. The page should show the current environment and display **Connected to Dataverse**.
8. If upgrading, edit the same HTML web resource and **replace its uploaded file**, then save and publish. Keep the original logical web resource name so existing navigation references remain valid.

**Optional command bar:** Upload `mightora_rest_command.js` as a **Script (JScript)** web resource. Replace `REPLACE_WITH_PUBLISHER_rest.html` inside its source with the actual HTML web resource name, then configure your command-bar action as `MightoraRestStudio.open` using that script. The command opens the REST Studio in a model-driven dialog with `Xrm.Navigation.navigateTo` from the command-bar context. You do not need a command bar to use the navigation page.

## Connecting to Dataverse

The web resource loads `ClientGlobalContext.js.aspx` from the signed-in Dataverse environment and reads `GetGlobalContext().getClientUrl()`. It checks that this is an HTTPS resource hosted inside that **same** environment. If this fails, REST requests are disabled with a diagnostic.

Network calls use `fetch` on `/api/data/v9.2/` at that verified origin, with `credentials: 'same-origin'`; browser session credentials are never extracted or displayed. Only the following methods are exposed: GET, HEAD, POST, PATCH, DELETE. There is **no token entry**, app secret, backend proxy, analytics or local persistence.

- Read requests show the response with a 1 MiB output cap and a 25-second timeout.
- Metadata search reads `EntityDefinitions`, `Attributes` and `ManyToOneRelationships` and displays friendly and logical names.
- Write requests require an explicit typed `EXECUTE` confirmation. PATCH uses `If-Match: *` unless explicitly overridden, to avoid unintentional upserts.
- Calls require the actual permissions held by the current signed-in user. Preview pages have conservative limits; user-defined queries can still consume server resources.
- Arbitrary external URLs, Graph, other Dataverse environments, `$batch`, query credentials, and unapproved HTTP headers are blocked.

**This is not a Microsoft Graph login solution.** Signing in to Dataverse does not automatically grant Graph access. Use the separate public REST Studio Graph explorer with a properly registered Entra application for delegated Graph access.

## Swagger 2.0

The bundled import/export engine is shared with the public REST Studio. JSON and YAML Swagger 2.0 definitions are processed in memory. Imported operations can only be sent when their URL points to the **current Dataverse environment**. Export generates an illustrative Swagger 2.0 specification for the currently prepared request; review it before publishing. No imported data is persisted automatically.

## Security and real-tenant validation

The generated HTML includes a Content Security Policy with cryptographic hashes of its inline JS and CSS. `script-src 'self'` is present *solely* to allow the Dataverse-supplied `ClientGlobalContext.js.aspx` dependency. `connect-src 'self'` permits only same-origin requests; images use embedded data URIs.

The tool does not store records or sensitive queries in localStorage. It sends requests only after the user deliberately chooses a metadata operation or presses Send, and obeys their Dataverse security roles. Browser Developer Tools → Network can be used for independent inspection.

**Tenant validation outstanding until you install and test it:**

- Verify `ClientGlobalContext.js.aspx` resolves from the final publisher-prefixed resource URL and the connection indicator is green.
- Verify GET `WhoAmI()`, `EntityDefinitions`, records and field discovery using users with different security roles.
- Check iframe/CSP restrictions and navigation behaviour on the actual tenant, desktop and mobile clients.
- Test appropriate permission errors without performing production writes.
- Verify any deliberate write scenarios in a dedicated test environment only.

Automated tests against mocked contexts **do not prove** compatibility with the tenant's browser, security and admin configuration.

References:
- https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/getglobalcontext-clientglobalcontext.js.aspx
- https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/webpage-html-web-resources
- https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/create-edit-web-resources
