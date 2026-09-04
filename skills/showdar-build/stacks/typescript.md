# TypeScript build guidance

Keep `unknown` at external boundaries until validated; avoid `any` and assertion chains that erase contracts. Model impossible states with discriminated unions, keep async error types explicit, and preserve public exports. Run the repository compiler with its actual `tsconfig` and test serialized inputs rather than trusting structural casts.
