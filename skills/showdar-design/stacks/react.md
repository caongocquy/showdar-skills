# React design guidance

React interfaces should preserve a small state graph and semantic browser behavior.

- Keep server, URL, draft, and derived state distinct; do not mirror values through effect chains.
- Use semantic HTML and native controls before custom interaction primitives.
- Use stable keys from domain identity and profile render churn before adding memoization.
- Model pending, error, empty, and retry states where the boundary can recover.
- Keep context scopes aligned to consumers and avoid one provider for unrelated high-churn state.
- Test keyboard navigation, focus return, long content, and asynchronous stale-result ordering.

Version note: confirm concurrent rendering and framework integration behavior against the pinned React version.
