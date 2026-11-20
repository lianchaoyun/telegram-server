-- 恢复 @verifybot 的英文种子文案。

UPDATE public.users
SET first_name = 'Verify Bot',
    about = 'Apply for official verification of a public channel, supergroup or bot.',
    updated_at = now()
WHERE id = 1250000011;

UPDATE public.bots
SET description = 'Apply for official verification of a public channel, supergroup or bot. The bot collects the application and reports the decision back to you.',
    commands = '[
        {"command": "start", "description": "how verification works"},
        {"command": "new", "description": "file a verification application"},
        {"command": "status", "description": "check your applications"},
        {"command": "cancel", "description": "cancel the current application"},
        {"command": "help", "description": "show help"}
    ]'::jsonb,
    updated_at = now()
WHERE bot_user_id = 1250000011;
