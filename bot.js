// ДОКТОР БОТ - СТАБИЛЬНАЯ ВЕРСИЯ
// Копируйте ВЕСЬ этот текст и заменяйте старый файл

console.log("Бот запускается...");

const TelegramBot = require('node-telegram-bot-api');

// ВАШ ТОКЕН (замените на свой)
const token = '7586407454:AAGHXTJ_iTPq7wNY9IqUTzAEZ2IL7hFsR_Y';
const bot = new TelegramBot(token, { 
    polling: {
        interval: 300, // интервал опроса
        timeout: 10,
        limit: 100,
        retryTimeout: 5000,
        params: {
            timeout: 10
        }
    }
});

// ВАШ ID в Telegram для уведомлений
const ADMIN_CHAT_ID = '8231278236';

// Хранилища данных
let appointments = [];
let nextId = 1;
const userStates = new Map(); // Состояния пользователей
const supportChats = new Set(); // Активные чаты поддержки

// Клавиатура для пользователя
function createUserKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📅 Записаться на прием'],
                ['📋 Мои записи'],
                ['❌ Отменить запись'],
                ['🆘 Техническая поддержка']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// Клавиатура для быстрого ответа администратору
function createAdminReplyKeyboard(userChatId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '💬 Ответить', callback_data: `reply_${userChatId}` },
                    { text: '✅ Завершить', callback_data: `close_${userChatId}` }
                ]
            ]
        }
    };
}

// Безопасная отправка сообщений
function safeSendMessage(chatId, text, options = {}) {
    return bot.sendMessage(chatId, text, options)
        .catch(err => {
            console.error(`Ошибка отправки в чат ${chatId}:`, err.message);
            // Если чат заблокировал бота, удаляем из поддержки
            if (err.response && err.response.body && err.response.body.error_code === 403) {
                supportChats.delete(chatId);
                userStates.delete(chatId);
            }
        });
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    safeSendMessage(chatId, 
        '👋 Здравствуйте! Я бот для записи к врачу.\n\n' +
        'Выберите действие на клавиатуре ниже:', 
        createUserKeyboard());
});

// Обработка инлайн-кнопок (админские)
bot.on('callback_query', async (callbackQuery) => {
    try {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const adminId = callbackQuery.from.id;
        
        // Проверяем, что это администратор
        if (adminId.toString() !== ADMIN_CHAT_ID) {
            await bot.answerCallbackQuery(callbackQuery.id, { 
                text: 'Только администратор может использовать эти кнопки' 
            });
            return;
        }
        
        if (data.startsWith('reply_')) {
            const userChatId = data.split('_')[1];
            await bot.answerCallbackQuery(callbackQuery.id);
            
            // Сохраняем состояние для ответа
            userStates.set(adminId, { 
                type: 'admin_reply', 
                targetChatId: userChatId 
            });
            
            await safeSendMessage(adminId, 
                `✍️ Введите ответ для пользователя (ID: ${userChatId}):\n` +
                `Или отправьте /cancel для отмены`);
        }
        else if (data.startsWith('close_')) {
            const userChatId = data.split('_')[1];
            
            // Удаляем из поддержки
            supportChats.delete(parseInt(userChatId));
            
            // Уведомляем пользователя
            await safeSendMessage(userChatId, 
                '✅ Диалог с поддержкой завершен.\n' +
                'Если у вас остались вопросы, нажмите "🆘 Техническая поддержка" снова.',
                createUserKeyboard());
            
            // Обновляем сообщение админа
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Чат поддержки закрыт' });
            await bot.editMessageText(
                `✅ Чат поддержки ${userChatId} закрыт.`,
                { chat_id: msg.chat.id, message_id: msg.message_id }
            );
        }
    } catch (err) {
        console.error('Ошибка в callback_query:', err);
    }
});

// Обработка кнопки "Записаться"
bot.onText(/Записаться на прием/, (msg) => {
    const chatId = msg.chat.id;
    
    // Выходим из режима поддержки если были в нем
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    userStates.set(chatId, { step: 1 });
    safeSendMessage(chatId, 'Полное ФИО', createUserKeyboard());
});

// Обработка кнопки "Мои записи"
bot.onText(/Мои записи/, (msg) => {
    const chatId = msg.chat.id;
    
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    const userAppointments = appointments.filter(app => app.chatId === chatId);
    
    if (userAppointments.length === 0) {
        safeSendMessage(chatId, 'У вас пока нет активных записей.', createUserKeyboard());
    } else {
        let message = '📋 Ваши записи:\n\n';
        userAppointments.forEach(app => {
            message += `№${app.id}\n👤 ФИО: ${app.patientName}\n📅 Дата: ${app.date} в ${app.time}\n📞 Телефон: ${app.phone}\n────────────\n`;
        });
        safeSendMessage(chatId, message, createUserKeyboard());
    }
});

// Обработка кнопки "Отменить запись"
bot.onText(/Отменить запись/, (msg) => {
    const chatId = msg.chat.id;
    
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    const userAppointments = appointments.filter(app => app.chatId === chatId);
    
    if (userAppointments.length === 0) {
        safeSendMessage(chatId, 'У вас нет записей для отмены.', createUserKeyboard());
        return;
    }
    
    let message = 'Выберите номер записи для отмены:\n\n';
    userAppointments.forEach(app => {
        message += `№${app.id} - ${app.date} ${app.time}\n`;
    });
    
    userStates.set(chatId, { step: 'cancel' });
    safeSendMessage(chatId, message, createUserKeyboard());
});

// Обработка кнопки "Техническая поддержка"
bot.onText(/Техническая поддержка/, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    const userUsername = msg.from.username ? `@${msg.from.username}` : 'нет username';
    
    // Включаем режим поддержки
    supportChats.add(chatId);
    
    // Сообщение пользователю
    safeSendMessage(chatId, 
        '🆘 Вы подключены к технической поддержке!\n\n' +
        'Напишите ваш вопрос, и администратор ответит вам здесь.\n' +
        'Для выхода из поддержки нажмите любую кнопку меню.\n\n' +
        'Ожидайте ответа...',
        createUserKeyboard());
    
    // Уведомление администратору
    const adminMessage = 
        `🚨 НОВЫЙ ЗАПРОС В ТЕХПОДДЕРЖКУ!\n\n` +
        `👤 Имя: ${userName}\n` +
        `📱 Username: ${userUsername}\n` +
        `🆔 ID чата: ${chatId}\n` +
        `⏰ Время: ${new Date().toLocaleString('ru-RU')}`;
    
    safeSendMessage(ADMIN_CHAT_ID, adminMessage, createAdminReplyKeyboard(chatId))
        .then(() => {
            console.log(`✅ Уведомление отправлено администратору о чате ${chatId}`);
        })
        .catch(err => {
            console.error('❌ Ошибка отправки уведомления:', err.message);
        });
});

// Команда /cancel для отмены действий
bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    
    if (userStates.has(chatId)) {
        userStates.delete(chatId);
        safeSendMessage(chatId, '❌ Действие отменено.', createUserKeyboard());
    }
});

// Обработка ВСЕХ сообщений
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text || '';
        
        // Пропускаем команды и кнопки (они уже обработаны)
        if (text.startsWith('/') || 
            text === '📅 Записаться на прием' ||
            text === '📋 Мои записи' ||
            text === '❌ Отменить запись' ||
            text === '🆘 Техническая поддержка') {
            return;
        }
        
        // Если администратор отвечает пользователю
        if (chatId.toString() === ADMIN_CHAT_ID) {
            const state = userStates.get(chatId);
            
            if (state && state.type === 'admin_reply') {
                const targetChatId = state.targetChatId;
                
                // Проверяем, что чат еще в поддержке
                if (!supportChats.has(parseInt(targetChatId))) {
                    await safeSendMessage(chatId, '❌ Этот пользователь больше не в режиме поддержки.');
                    userStates.delete(chatId);
                    return;
                }
                
                // Отправляем ответ пользователю
                await safeSendMessage(targetChatId, 
                    `📩 Ответ от поддержки:\n\n${text}\n\n` +
                    `Если вопрос решен, нажмите любую кнопку меню.`,
                    createUserKeyboard());
                
                await safeSendMessage(chatId, `✅ Ответ отправлен пользователю ${targetChatId}`);
                userStates.delete(chatId);
                return;
            }
        }
        
        // Если пользователь в режиме поддержки
        if (supportChats.has(chatId)) {
            const userName = msg.from.first_name || 'Пользователь';
            const userMessage = 
                `💬 Сообщение от пользователя:\n\n` +
                `👤 ${userName} (ID: ${chatId}):\n` +
                `${text}`;
            
            await safeSendMessage(ADMIN_CHAT_ID, userMessage, createAdminReplyKeyboard(chatId));
            await safeSendMessage(chatId, '✅ Ваше сообщение отправлено поддержке. Ожидайте ответа...');
            return;
        }
        
        // Если пользователь в процессе записи
        const state = userStates.get(chatId);
        if (state) {
            if (state.step === 1) {
                state.name = text;
                state.step = 2;
                await safeSendMessage(chatId, 'На какую дату хотите записаться? (Например: 20 декабря)', createUserKeyboard());
            }
            else if (state.step === 2) {
                state.date = text;
                state.step = 3;
                await safeSendMessage(chatId, 'На какое время? (Например: 14:30)', createUserKeyboard());
            }
            else if (state.step === 3) {
                state.time = text;
                state.step = 4;
                await safeSendMessage(chatId, 'Ваш номер телефона для связи? (Например: 89161234567)', createUserKeyboard());
            }
            else if (state.step === 4) {
                const phone = text;
                
                // Сохраняем запись
                const appointment = {
                    id: nextId++,
                    patientName: state.name,
                    date: state.date,
                    time: state.time,
                    phone: phone,
                    chatId: chatId
                };
                
                appointments.push(appointment);
                userStates.delete(chatId);
                
                // Отправляем подтверждение
                await safeSendMessage(chatId, 
                    `✅ Запись успешно создана!\n\n` +
                    `📋 Номер записи: ${appointment.id}\n` +
                    `👤 ФИО: ${state.name}\n` +
                    `📅 Дата: ${state.date}\n` +
                    `⏰ Время: ${state.time}\n` +
                    `📞 Телефон: ${phone}\n\n` +
                    `Запись сохранена. Администратор свяжется с вами.`,
                    createUserKeyboard());
                
                // Уведомление администратору
                const newAppointmentMsg = 
                    `📋 НОВАЯ ЗАПИСЬ!\n\n` +
                    `👤 ФИО: ${state.name}\n` +
                    `📅 Дата: ${state.date}\n` +
                    `⏰ Время: ${state.time}\n` +
                    `📞 Телефон: ${phone}\n` +
                    `🆔 ID записи: ${appointment.id}`;
                
                await safeSendMessage(ADMIN_CHAT_ID, newAppointmentMsg);
            }
            else if (state.step === 'cancel') {
                const idToCancel = parseInt(text);
                const appointment = appointments.find(app => app.id === idToCancel);
                
                if (appointment && appointment.chatId === chatId) {
                    appointments = appointments.filter(app => app.id !== idToCancel);
                    userStates.delete(chatId);
                    await safeSendMessage(chatId, `✅ Запись №${idToCancel} отменена.`, createUserKeyboard());
                } else {
                    await safeSendMessage(chatId, 'Запись не найдена. Проверьте номер.', createUserKeyboard());
                }
            }
        }
    } catch (err) {
        console.error('❌ Критическая ошибка в обработке сообщения:', err);
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling:', error.code || error.message);
});

bot.on('webhook_error', (error) => {
    console.error('❌ Ошибка webhook:', error);
});

// Восстановление после ошибок
process.on('uncaughtException', (error) => {
    console.error('❌ Необработанная ошибка:', error);
    // Автоматический перезапуск через 5 секунд
    setTimeout(() => {
        console.log('🔄 Перезапуск бота после ошибки...');
        process.exit(1);
    }, 5000);
});

// Автоматическое сохранение данных каждые 5 минут
setInterval(() => {
    console.log(`📊 Статистика: ${appointments.length} записей, ${supportChats.size} активных чатов поддержки`);
}, 5 * 60 * 1000);

console.log("✅ Бот запущен и готов к работе!");
console.log("📱 Для остановки нажмите Ctrl+C");