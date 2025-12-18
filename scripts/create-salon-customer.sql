-- Substitua 'SEU_SALON_ID_AQUI' pelo ID do salão desejado
INSERT INTO salon_customers (
    salon_id,
    profile_id,
    marketing_opt_in,
    interaction_status,
    created_at,
    updated_at
)
VALUES (
    'SEU_SALON_ID_AQUI'::uuid,
    '1dcb44d1-10ec-4b3a-b70c-1057abb03114'::uuid,
    false,
    'new',
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;
