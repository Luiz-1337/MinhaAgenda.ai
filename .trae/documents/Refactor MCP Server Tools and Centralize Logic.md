I will refactor the `packages/mcp-server` tools to be more robust and reuse business logic by centralizing it in `packages/db`.

### 1. Centralize Business Logic in `packages/db`
I will create a new `services` module in `packages/db` to house shared business logic.
- **Add Dependencies**: Add `zod`, `date-fns`, and `date-fns-tz` to `packages/db`.
- **Create `packages/db/src/services/appointments.ts`**:
    - Port `createAppointmentService` from `apps/web`.
    - Adapt it to be framework-agnostic (remove Next.js specific headers/auth checks, accepting validated inputs).
- **Create `packages/db/src/services/availability.ts`**:
    - Port `getAvailableSlots` from `apps/web`.
    - Include necessary time utility helpers.
- **Export Services**: Expose these services via `packages/db/src/index.ts`.

### 2. Refactor `packages/mcp-server` Tools

#### A. Create `src/tools/customer.tool.ts`
- Implement `get_or_create_customer_by_phone`.
- **Logic**:
    - Check `profiles` table by phone.
    - Return existing profile if found.
    - Create new profile if not found but name is provided.
    - Return `found: false` if neither.

#### B. Refactor `src/tools/appointments.tool.ts`
- Update `schedule_appointment`.
- **Logic**:
    - Accept `phone` instead of `clientId`.
    - Lookup `clientId` using `phone`.
    - Call the shared `createAppointmentService` from `packages/db`.
    - Handle errors and return user-friendly messages.

#### C. Refactor `src/tools/availability.tool.ts`
- Update `get_available_slots`.
- **Logic**:
    - Call the shared `getAvailableSlots` service from `packages/db`.
    - Return a clean list of available time strings.

### 3. Verification
- I will verify the changes by running the build for `packages/db` and ensuring `packages/mcp-server` can import and use the new services.
- I will verify the tools by inspecting the code and ensuring all required parameters are handled.
