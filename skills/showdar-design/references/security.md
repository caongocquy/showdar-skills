# Design security boundaries

UI is an input and disclosure boundary. Visual polish must not weaken authorization, secret handling, or safe rendering.

- Client-side visibility, disabled buttons, and route guards are UX; authoritative authorization belongs in the server, domain, or native owner.
- Treat user content, URLs, filenames, markdown, HTML, and rich text as untrusted. Use the repository’s safe renderer and escaping boundary.
- Do not display tokens, secret values, private identifiers, or debug payloads merely to make a screen easier to diagnose.
- Make destructive actions explicit, scoped, and recoverable. Show target, consequence, confirmation, and completion/error state.
- Avoid autocomplete or persistence that stores sensitive values outside the intended secure owner.
- For desktop IPC and mobile deep links, validate and constrain every value that crosses from the UI into privileged code.

Verify with an accessibility and security review of the changed path; a visually hidden element is not a security control.
