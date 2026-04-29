import * as dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

// ============================================================================
// CONFIGURATION
// ============================================================================
const SOURCE_SALON_ID = '8b68b7d8-c0d0-4af1-b43b-8462479ca9c1'
const TARGET_SALON_ID = '37dc22de-410b-4210-8ea6-b506ed514e08'

async function main() {
  console.log('=== Copy Salon Configuration ===')
  console.log(`Source: ${SOURCE_SALON_ID}`)
  console.log(`Target: ${TARGET_SALON_ID}`)
  console.log('')

  // Validate both salons exist
  const [sourceSalon] = await sql`SELECT id, name FROM salons WHERE id = ${SOURCE_SALON_ID}`
  const [targetSalon] = await sql`SELECT id, name FROM salons WHERE id = ${TARGET_SALON_ID}`

  if (!sourceSalon) { console.error('Source salon not found!'); process.exit(1) }
  if (!targetSalon) { console.error('Target salon not found!'); process.exit(1) }

  console.log(`Source salon: ${sourceSalon.name}`)
  console.log(`Target salon: ${targetSalon.name}`)
  console.log('')

  await sql.begin(async (tx) => {
    // ID maps
    const serviceMap = new Map()
    const professionalMap = new Map()
    const agentMap = new Map()
    const recoveryFlowMap = new Map()

    // ========================================================================
    // PHASE 1: Clean target salon config data
    // ========================================================================
    console.log('--- PHASE 1: Cleaning target salon data ---')

    // Clean transactional data that references config entities (no cascade)
    const delWl = await tx`DELETE FROM waiting_list WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delWl.count} waiting_list`)

    const delAppt = await tx`DELETE FROM appointments WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delAppt.count} appointments`)

    // Clean embeddings and knowledge base via agents
    const delEmb = await tx`DELETE FROM embeddings WHERE agent_id IN (SELECT id FROM agents WHERE salon_id = ${TARGET_SALON_ID})`
    console.log(`  Deleted ${delEmb.count} embeddings`)

    const delKb = await tx`DELETE FROM agent_knowledge_base WHERE agent_id IN (SELECT id FROM agents WHERE salon_id = ${TARGET_SALON_ID})`
    console.log(`  Deleted ${delKb.count} agent_knowledge_base`)

    // Clean recovery steps via recovery flows
    const delRs = await tx`DELETE FROM recovery_steps WHERE recovery_flow_id IN (SELECT id FROM recovery_flows WHERE salon_id = ${TARGET_SALON_ID})`
    console.log(`  Deleted ${delRs.count} recovery_steps`)

    const delRf = await tx`DELETE FROM recovery_flows WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delRf.count} recovery_flows`)

    // Clean schedule overrides
    const delSo = await tx`DELETE FROM schedule_overrides WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delSo.count} schedule_overrides`)

    // Clean professional_services via professionals
    const delPs = await tx`DELETE FROM professional_services WHERE professional_id IN (SELECT id FROM professionals WHERE salon_id = ${TARGET_SALON_ID})`
    console.log(`  Deleted ${delPs.count} professional_services`)

    // Clean availability via professionals
    const delAv = await tx`DELETE FROM availability WHERE professional_id IN (SELECT id FROM professionals WHERE salon_id = ${TARGET_SALON_ID})`
    console.log(`  Deleted ${delAv.count} availability`)

    // Clean professionals
    const delPr = await tx`DELETE FROM professionals WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delPr.count} professionals`)

    // Clean services
    const delSv = await tx`DELETE FROM services WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delSv.count} services`)

    // Clean products
    const delPd = await tx`DELETE FROM products WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delPd.count} products`)

    // Clean agents (cascade handles embeddings/kb but we already deleted)
    const delAg = await tx`DELETE FROM agents WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delAg.count} agents`)

    // Clean system prompt templates
    const delSpt = await tx`DELETE FROM system_prompt_templates WHERE salon_id = ${TARGET_SALON_ID}`
    console.log(`  Deleted ${delSpt.count} system_prompt_templates`)

    console.log('')

    // ========================================================================
    // PHASE 2: Update salon fields
    // ========================================================================
    console.log('--- PHASE 2: Updating salon fields ---')

    await tx`
      UPDATE salons SET
        settings = src.settings,
        work_hours = src.work_hours,
        description = src.description,
        address = src.address,
        updated_at = NOW()
      FROM (SELECT settings, work_hours, description, address FROM salons WHERE id = ${SOURCE_SALON_ID}) AS src
      WHERE salons.id = ${TARGET_SALON_ID}
    `
    console.log('  Salon fields updated (settings, work_hours, description, address)')
    console.log('')

    // ========================================================================
    // PHASE 3: Copy entities
    // ========================================================================
    console.log('--- PHASE 3: Copying entities ---')

    // 3a. Services
    const srcServices = await tx`
      SELECT id, name, description, duration, price, price_type, price_min, price_max, is_active
      FROM services WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const s of srcServices) {
      const newId = randomUUID()
      serviceMap.set(s.id, newId)
      await tx`
        INSERT INTO services (id, salon_id, name, description, duration, price, price_type, price_min, price_max, is_active)
        VALUES (${newId}, ${TARGET_SALON_ID}, ${s.name}, ${s.description}, ${s.duration}, ${s.price}, ${s.price_type}, ${s.price_min}, ${s.price_max}, ${s.is_active})
      `
    }
    console.log(`  Copied ${srcServices.length} services`)

    // 3b. Products
    const srcProducts = await tx`
      SELECT id, name, description, price, is_active
      FROM products WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const p of srcProducts) {
      const newId = randomUUID()
      await tx`
        INSERT INTO products (id, salon_id, name, description, price, is_active)
        VALUES (${newId}, ${TARGET_SALON_ID}, ${p.name}, ${p.description}, ${p.price}, ${p.is_active})
      `
    }
    console.log(`  Copied ${srcProducts.length} products`)

    // 3c. Professionals (user_id = null, google_calendar_id = null)
    const srcProfessionals = await tx`
      SELECT id, role, name, email, phone, commission_rate, service_ids, is_active
      FROM professionals WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const p of srcProfessionals) {
      const newId = randomUUID()
      professionalMap.set(p.id, newId)

      // Remap service_ids if present
      let newServiceIds = null
      if (p.service_ids && Array.isArray(p.service_ids)) {
        newServiceIds = p.service_ids.map(oldSid => serviceMap.get(oldSid) || oldSid)
      }

      await tx`
        INSERT INTO professionals (id, salon_id, user_id, role, name, email, phone, commission_rate, service_ids, google_calendar_id, is_active)
        VALUES (${newId}, ${TARGET_SALON_ID}, ${null}, ${p.role}, ${p.name}, ${p.email}, ${p.phone}, ${p.commission_rate}, ${newServiceIds ? JSON.stringify(newServiceIds) : null}::jsonb, ${null}, ${p.is_active})
      `
    }
    console.log(`  Copied ${srcProfessionals.length} professionals`)

    // 3d. Availability
    let availCount = 0
    for (const [oldProfId, newProfId] of professionalMap) {
      const srcAvail = await tx`
        SELECT day_of_week, start_time, end_time, is_break
        FROM availability WHERE professional_id = ${oldProfId}
      `
      for (const a of srcAvail) {
        await tx`
          INSERT INTO availability (id, professional_id, day_of_week, start_time, end_time, is_break)
          VALUES (${randomUUID()}, ${newProfId}, ${a.day_of_week}, ${a.start_time}, ${a.end_time}, ${a.is_break})
        `
        availCount++
      }
    }
    console.log(`  Copied ${availCount} availability slots`)

    // 3e. ProfessionalServices
    let psCount = 0
    for (const [oldProfId, newProfId] of professionalMap) {
      const srcPs = await tx`
        SELECT service_id FROM professional_services WHERE professional_id = ${oldProfId}
      `
      for (const ps of srcPs) {
        const newServiceId = serviceMap.get(ps.service_id)
        if (newServiceId) {
          await tx`
            INSERT INTO professional_services (id, professional_id, service_id)
            VALUES (${randomUUID()}, ${newProfId}, ${newServiceId})
          `
          psCount++
        }
      }
    }
    console.log(`  Copied ${psCount} professional_services links`)

    // 3f. ScheduleOverrides
    let soCount = 0
    for (const [oldProfId, newProfId] of professionalMap) {
      const srcSo = await tx`
        SELECT start_time, end_time, reason
        FROM schedule_overrides WHERE professional_id = ${oldProfId} AND salon_id = ${SOURCE_SALON_ID}
      `
      for (const so of srcSo) {
        await tx`
          INSERT INTO schedule_overrides (id, salon_id, professional_id, start_time, end_time, reason)
          VALUES (${randomUUID()}, ${TARGET_SALON_ID}, ${newProfId}, ${so.start_time}, ${so.end_time}, ${so.reason})
        `
        soCount++
      }
    }
    console.log(`  Copied ${soCount} schedule_overrides`)

    // 3g. Agents (without whatsapp/evolution fields)
    const srcAgents = await tx`
      SELECT id, name, system_prompt, model, tone, is_active
      FROM agents WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const a of srcAgents) {
      const newId = randomUUID()
      agentMap.set(a.id, newId)
      await tx`
        INSERT INTO agents (id, salon_id, name, system_prompt, model, tone, whatsapp_number, whatsapp_status, whatsapp_connected_at, whatsapp_verified_at, evolution_instance_name, evolution_instance_token, evolution_connection_status, evolution_connected_at, is_active)
        VALUES (${newId}, ${TARGET_SALON_ID}, ${a.name}, ${a.system_prompt}, ${a.model}, ${a.tone}, ${null}, ${null}, ${null}, ${null}, ${null}, ${null}, ${null}, ${null}, ${a.is_active})
      `
    }
    console.log(`  Copied ${srcAgents.length} agents`)

    // 3h. AgentKnowledgeBase
    let kbCount = 0
    for (const [oldAgentId, newAgentId] of agentMap) {
      const srcKb = await tx`
        SELECT content, embedding::text as embedding_text, metadata
        FROM agent_knowledge_base WHERE agent_id = ${oldAgentId}
      `
      for (const kb of srcKb) {
        await tx.unsafe(`
          INSERT INTO agent_knowledge_base (id, agent_id, content, embedding, metadata)
          VALUES ($1, $2, $3, $4::vector, $5::jsonb)
        `, [randomUUID(), newAgentId, kb.content, kb.embedding_text, kb.metadata ? JSON.stringify(kb.metadata) : null])
        kbCount++
      }
    }
    console.log(`  Copied ${kbCount} agent_knowledge_base entries`)

    // 3i. Embeddings
    let embCount = 0
    for (const [oldAgentId, newAgentId] of agentMap) {
      const srcEmb = await tx`
        SELECT content, embedding::text as embedding_text, metadata
        FROM embeddings WHERE agent_id = ${oldAgentId}
      `
      for (const e of srcEmb) {
        await tx.unsafe(`
          INSERT INTO embeddings (id, agent_id, content, embedding, metadata)
          VALUES ($1, $2, $3, $4::vector, $5::jsonb)
        `, [randomUUID(), newAgentId, e.content, e.embedding_text, e.metadata ? JSON.stringify(e.metadata) : null])
        embCount++
      }
    }
    console.log(`  Copied ${embCount} embeddings`)

    // 3j. SystemPromptTemplates
    const srcSpt = await tx`
      SELECT name, description, system_prompt, category, is_active
      FROM system_prompt_templates WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const t of srcSpt) {
      await tx`
        INSERT INTO system_prompt_templates (id, salon_id, name, description, system_prompt, category, is_active)
        VALUES (${randomUUID()}, ${TARGET_SALON_ID}, ${t.name}, ${t.description}, ${t.system_prompt}, ${t.category}, ${t.is_active})
      `
    }
    console.log(`  Copied ${srcSpt.length} system_prompt_templates`)

    // 3k. RecoveryFlows
    const srcRf = await tx`
      SELECT id, name, is_active
      FROM recovery_flows WHERE salon_id = ${SOURCE_SALON_ID}
    `
    for (const rf of srcRf) {
      const newId = randomUUID()
      recoveryFlowMap.set(rf.id, newId)
      await tx`
        INSERT INTO recovery_flows (id, salon_id, name, is_active)
        VALUES (${newId}, ${TARGET_SALON_ID}, ${rf.name}, ${rf.is_active})
      `
    }
    console.log(`  Copied ${srcRf.length} recovery_flows`)

    // 3l. RecoverySteps
    let rsCount = 0
    for (const [oldFlowId, newFlowId] of recoveryFlowMap) {
      const srcRs = await tx`
        SELECT step_order, days_after_inactivity, message_template, is_active
        FROM recovery_steps WHERE recovery_flow_id = ${oldFlowId}
      `
      for (const rs of srcRs) {
        await tx`
          INSERT INTO recovery_steps (id, recovery_flow_id, step_order, days_after_inactivity, message_template, is_active)
          VALUES (${randomUUID()}, ${newFlowId}, ${rs.step_order}, ${rs.days_after_inactivity}, ${rs.message_template}, ${rs.is_active})
        `
        rsCount++
      }
    }
    console.log(`  Copied ${rsCount} recovery_steps`)

    console.log('')
    console.log('=== Done! All data copied successfully ===')
  })

  await sql.end()
}

main().catch((err) => {
  console.error('Error copying salon config:', err)
  process.exit(1)
})
