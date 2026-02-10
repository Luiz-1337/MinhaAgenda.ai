/**
 * Script de diagnóstico para integração Evolution API (WhatsApp)
 * Verifica conectividade, autenticação e status das instâncias
 * 
 * Uso: dotenv -e .env -- tsx scripts/diagnose-evolution-api.ts [instanceName]
 */

import * as dotenv from 'dotenv'

dotenv.config()

const baseUrl = process.env.EVOLUTION_API_URL
const apiKey = process.env.EVOLUTION_API_KEY

async function main() {
    console.log('🔍 Diagnosticando Evolution API...\n')

    if (!baseUrl) {
        console.error('❌ EVOLUTION_API_URL não configurado')
        process.exit(1)
    }
    if (!apiKey) {
        console.error('❌ EVOLUTION_API_KEY não configurado')
        process.exit(1)
    }

    console.log(`📡 URL: ${baseUrl}`)
    console.log(`🔑 API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}\n`)

    try {
        // 1. Verificar conectividade básica
        console.log('1️⃣ Testando conectividade e autenticação...')

        let instances: any[] = []
        let usedEndpoint = ''

        // Tenta /instances (v1)
        try {
            console.log('   Tentando GET /instances...')
            const response = await fetch(`${baseUrl}/instances`, { headers: { 'apikey': apiKey } })
            if (response.ok) {
                const data = await response.json()
                instances = Array.isArray(data) ? data : (data as any).response || (data as any).data || []
                usedEndpoint = '/instances'
                console.log('   ✅ Sucesso com /instances')
            } else {
                console.log(`   ❌ /instances retornou ${response.status}`)
            }
        } catch (e) {
            console.log(`   ❌ Erro em /instances: ${(e as Error).message}`)
        }

        // Se falhou, tenta /instance/fetchInstances (v2)
        if (!usedEndpoint) {
            try {
                console.log('   Tentando GET /instance/fetchInstances...')
                const response = await fetch(`${baseUrl}/instance/fetchInstances`, { headers: { 'apikey': apiKey } })
                if (response.ok) {
                    const data = await response.json()
                    instances = Array.isArray(data) ? data : (data as any).response || (data as any).data || []
                    usedEndpoint = '/instance/fetchInstances'
                    console.log('   ✅ Sucesso com /instance/fetchInstances')
                } else {
                    console.log(`   ❌ /instance/fetchInstances retornou ${response.status}`)
                }
            } catch (e) {
                console.log(`   ❌ Erro em /instance/fetchInstances: ${(e as Error).message}`)
            }
        }

        if (!usedEndpoint) {
            console.error('❌ Falha ao conectar em todos os endpoints tentados.')
            process.exit(1)
        }

        console.log(`✅ Conexão bem sucedida via ${usedEndpoint}!\n`)

        // 2. Listar instâncias
        console.log('2️⃣ Analisando instâncias...')

        if (instances.length === 0) {
            console.log('⚠️  Nenhuma instância encontrada.')
        } else {
            console.log(`✅ ${instances.length} instância(s) encontrada(s):\n`)

            for (const inst of instances) {
                const name = inst.instance?.instanceName || inst.instanceName
                const status = inst.instance?.status || inst.status
                const owner = inst.instance?.owner || inst.owner

                console.log(`   📱 Instância: ${name}`)
                console.log(`      Status: ${status}`)
                console.log(`      Owner: ${owner || 'N/A'}`)

                // Verificar status de conexão detalhado
                try {
                    const connRes = await fetch(`${baseUrl}/instance/connectionState/${name}`, {
                        headers: { 'apikey': apiKey }
                    })
                    if (connRes.ok) {
                        const connData: any = await connRes.json()
                        const state = connData?.instance?.state || 'unknown'
                        console.log(`      Connection State: ${state}`)
                    }
                } catch (e) {
                    console.log(`      Erro ao verificar connectionState: ${(e as Error).message}`)
                }
                console.log('')
            }
        }

        console.log('\n✅ Diagnóstico completo!')

    } catch (error: any) {
        console.error('❌ Erro fatal durante diagnóstico:', error.message)
        if (error.cause) console.error(error.cause)
    }
}

main()
