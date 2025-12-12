I have identified the root causes of the build errors:

1.  **Name Collision (`services`):** The `@repo/db` package exports both the `services` database table (from `schema.ts`) and a namespace object named `services` (from `services/index.ts`). The namespace export shadows the table export, causing errors like `Property 'id' does not exist on type...` whenever the code tries to access table columns (e.g., `services.id`).
2.  **Missing ID Generation (`profiles`):** The `customer.tool.ts` tries to insert a new profile without providing an ID, but the `profiles` table definition lacks a default value generator for the `id` column.

Here is the plan to fix these issues:

### 1. Resolve Name Collision in `@repo/db`
*   **File:** `packages/db/src/index.ts`
*   **Action:** Rename the namespace export from `export * as services` to `export * as domainServices`. This ensures `import { services }` correctly refers to the database table, while `domainServices` refers to the service layer logic.

### 2. Update Consumers of the Service Layer
Update files that use the service layer logic to import `domainServices` instead of relying on the shadowed `services` export.

*   **`packages/mcp-server/src/tools/appointments.tool.ts`**: Update imports to use `domainServices` for logic and `services` for table references.
*   **`packages/mcp-server/src/tools/availability.tool.ts`**: Update import to `domainServices`.
*   **`apps/web/app/actions/appointments.ts`**: Update imports and fix usages where `sharedServices` (the namespace) was incorrectly used for table columns.
*   **`apps/web/lib/availability.ts`**: Update to use `domainServices`.

### 3. Fix `profiles` Schema
*   **File:** `packages/db/src/schema.ts`
*   **Action:** Update the `profiles` table definition to include `.defaultRandom()` for the `id` column. This allows creating profiles (e.g., via the customer tool) without manually generating a UUID.

### 4. Verification
*   After applying these changes, the type errors regarding `services.id`, `services.name`, and the missing `id` in `profiles` insert should be resolved.
