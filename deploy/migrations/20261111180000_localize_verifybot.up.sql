-- 将内置 @verifybot 的显示名称、简介和命令说明本地化为中文。
-- 旧的英文种子在 20260714003112_verify_service_bot 中；启动时的 branding
-- 同步（cmd/telesrv/main.go）也会写入同样的 about/description。

UPDATE public.users
SET first_name = '验证机器人',
    about = '申请频道、超级群组或机器人的官方认证。我会收集申请并把审核结果通知你。',
    updated_at = now()
WHERE id = 1250000011;

UPDATE public.bots
SET description = '申请频道、超级群组或机器人的官方认证。我会收集申请并把审核结果通知你。',
    commands = '[
        {"command": "start", "description": "认证流程说明"},
        {"command": "new", "description": "提交认证申请"},
        {"command": "status", "description": "查看我的申请"},
        {"command": "cancel", "description": "取消当前申请"},
        {"command": "help", "description": "显示帮助"}
    ]'::jsonb,
    updated_at = now()
WHERE bot_user_id = 1250000011;
