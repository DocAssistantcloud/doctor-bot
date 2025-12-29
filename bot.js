// БОТ ДЛЯ RAILWAY - ПРОСТАЯ РАБОЧАЯ ВЕРСИЯ
console.log("🚀 Бот запускается...");

const TelegramBot = require('node-telegram-bot-api');

// ========== ВАШИ ДАННЫЕ ==========
// ЗАМЕНИТЕ ТОЛЬКО ЭТИ 2 СТРОКИ ↓
const BOT_TOKEN = '7586407454:AAGHXTJ_iTPq7wNY9IqUTzAEZ2IL7hFsR_Y';
const ADMIN_ID = '@Cullinanholder';
// =================================

console.log("Токен:", BOT_TOKEN ? "✅ Есть" : "❌ НЕТ!");
console.log("Админ ID:", ADMIN_ID || "❌ Не указан");

if (!BOT_TOKEN) {
    console.error("❌ ОШИБКА: Нет токена бота!");
    console.error("Замените BOT_TOKEN в коде на ваш токен");
    process.exit(1);
}

if (!ADMIN_ID) {
    console.warn("⚠️ Внимание: Админ ID не указан. Уведомления не будут приходить.");
}

// Создаем бота
const bot = new TelegramBot(BOT_TOKEN, { 
    polling: {
        interval: 300,
        timeout: 10,
        limit: 100,
        retryTimeout: 5000
    }
});

// База данных в памяти
let appointments = [];
let nextId = 1;
const userStates = {};
const supportChats = new Set();

// Клавиатура
function createKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📅 Записаться на прием'],
                ['📋 Мои записи'],
                ['❌ Отменить запись'],
                ['🆘 Техподдержка']
            ],
            resize_keyboard: true
        }
    };
}

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '👋 Здравствуйте! Я бот для записи к врачу.\n\n' +
        'Выберите действие на клавиатуре ниже:', 
        createKeyboard());
});

// Запись на прием
bot.onText(/Записаться на прием/, (msg) => {
    const chatId = msg.chat.id;
    
    // Выходим из поддержки если были там
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    userStates[chatId] = { step: 1 };
    bot.sendMessage(chatId, '📝 Полное ФИО:', createKeyboard());
});

// Мои записи
bot.onText(/Мои записи/, (msg) => {
    const chatId = msg.chat.id;
    
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    const userAppointments = appointments.filter(app => app.chatId === chatId);
    
    if (userAppointments.length === 0) {
        bot.sendMessage(chatId, '📭 У вас пока нет активных записей.', createKeyboard());
    } else {
        let message = '📋 Ваши записи:\n\n';
        userAppointments.forEach(app => {
            message += `№${app.id}\n`;
            message += `👤 ФИО: ${app.patientName}\n`;
            message += `📅 Дата: ${app.date} в ${app.time}\n`;
            message += `📞 Телефон: ${app.phone}\n`;
            message += `────────────\n`;
        });
        bot.sendMessage(chatId, message, createKeyboard());
    }
});

// Отменить запись
bot.onText(/Отменить запись/, (msg) => {
    const chatId = msg.chat.id;
    
    if (supportChats.has(chatId)) {
        supportChats.delete(chatId);
    }
    
    const userAppointments = appointments.filter(app => app.chatId === chatId);
    
    if (userAppointments.length === 0) {
        bot.sendMessage(chatId, '❌ У вас нет записей для отмены.', createKeyboard());
        return;
    }
    
    let message = 'Выберите номер записи для отмены:\n\n';
    userAppointments.forEach(app => {
        message += `№${app.id} - ${app.date} ${app.time}\n`;
    });
    
    userStates[chatId] = { step: 'cancel' };
    bot.sendMessage(chatId, message, createKeyboard());
});

// Техподдержка
bot.onText(/Техподдержка/, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Пользователь';
    
    // Включаем режим поддержки
    supportChats.add(chatId);
    
    // Сообщение пользователю
    bot.sendMessage(chatId, 
        '🆘 Вы подключены к технической поддержке!\n\n' +
        'Напишите ваш вопрос, и администратор ответит вам здесь.\n' +
        'Для выхода из режима поддержки нажмите любую кнопку меню.\n\n' +
        '⏳ Ожидайте ответа...',
        createKeyboard());
    
    // Уведомление администратору (если ID указан)
    if (ADMIN_ID) {
        const adminMessage = 
            `🚨 НОВЫЙ ЗАПРОС В ТЕХПОДДЕРЖКУ!\n\n` +
            `👤 Имя: ${userName}\n` +
            `🆔 ID чата: ${chatId}\n` +
            `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `💬 Для связи с пользователем:\n` +
            `1. Напишите этому боту\n` +
            `2. Или используйте ID: ${chatId}`;
        
        bot.sendMessage(ADMIN_ID, adminMessage)
            .then(() => {
                console.log(`✅ Уведомление отправлено администратору о чате ${chatId}`);
            })
            .catch(err => {
                console.error('❌ Ошибка отправки уведомления:', err.message);
            });
    }
});

// Обработка всех сообщений
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    
    // Пропускаем команды и кнопки
    if (text.startsWith('/') || 
        text === '📅 Записаться на прием' ||
        text === '📋 Мои записи' ||
        text === '❌ Отменить запись' ||
        text === '🆘 Техподдержка') {
        return;
    }
    
    // Если пользователь в режиме поддержки
    if (supportChats.has(chatId)) {
        const userName = msg.from.first_name || 'Пользователь';
        
        // Пересылаем сообщение администратору
        if (ADMIN_ID) {
            const userMessage = 
                `💬 Сообщение от пользователя:\n\n` +
                `👤 ${userName} (ID: ${chatId}):\n` +
                `${text}`;
            
            bot.sendMessage(ADMIN_ID, userMessage)
                .catch(err => {
                    console.log('Не удалось отправить админу:', err.message);
                });
        }
        
        bot.sendMessage(chatId, '✅ Ваше сообщение отправлено поддержке. Ожидайте ответа...');
        return;
    }
    
    // Если пользователь в процессе записи
    const state = userStates[chatId];
    if (state) {
        if (state.step === 1) {
            state.name = text;
            state.step = 2;
            bot.sendMessage(chatId, '📅 На какую дату хотите записаться? (Например: 20 декабря)', createKeyboard());
        }
        else if (state.step === 2) {
            state.date = text;
            state.step = 3;
            bot.sendMessage(chatId, '⏰ На какое время? (Например: 14:30)', createKeyboard());
        }
        else if (state.step === 3) {
            state.time = text;
            state.step = 4;
            bot.sendMessage(chatId, '📞 Ваш номер телефона для связи? (Например: 89161234567)', createKeyboard());
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
            delete userStates[chatId];
            
            // Отправляем подтверждение
            bot.sendMessage(chatId, 
                `✅ Запись успешно создана!\n\n` +
                `📋 Номер записи: ${appointment.id}\n` +
                `👤 ФИО: ${state.name}\n` +
                `📅 Дата: ${state.date}\n` +
                `⏰ Время: ${state.time}\n` +
                `📞 Телефон: ${phone}\n\n` +
                `💾 Запись сохранена. Администратор свяжется с вами.`,
                createKeyboard());
            
            // Уведомление администратору (если ID указан)
            if (ADMIN_ID) {
                const newAppointmentMsg = 
                    `📋 НОВАЯ ЗАПИСЬ!\n\n` +
                    `👤 ФИО: ${state.name}\n` +
                    `📅 Дата: ${state.date}\n` +
                    `⏰ Время: ${state.time}\n` +
                    `📞 Телефон: ${phone}\n` +
                    `🆔 ID записи: ${appointment.id}`;
                
                bot.sendMessage(ADMIN_ID, newAppointmentMsg)
                    .catch(() => {
                        console.log('Новая запись:', newAppointmentMsg);
                    });
            }
        }
        else if (state.step === 'cancel') {
            const idToCancel = parseInt(text);
            const appointment = appointments.find(app => app.id === idToCancel);
            
            if (appointment && appointment.chatId === chatId) {
                appointments = appointments.filter(app => app.id !== idToCancel);
                delete userStates[chatId];
                bot.sendMessage(chatId, `✅ Запись №${idToCancel} отменена.`, createKeyboard());
            } else {
                bot.sendMessage(chatId, '❌ Запись не найдена. Проверьте номер.', createKeyboard());
            }
        }
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling:', error.code || error.message);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Необработанная ошибка:', error);
});

console.log("=========================================");
console.log("✅ Бот запущен и готов к работе!");
console.log("🤖 Бот работает на Railway 24/7");
console.log("📱 Для остановки: Railway → Stop Service");
console.log("=========================================");
