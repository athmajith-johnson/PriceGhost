import axios from 'axios';
import { userQueries, productQueries, priceHistoryQueries, stockStatusHistoryQueries } from '../models';
import { scrapeProductWithVoting } from './scraper';

// In-memory cache for pending additions
interface PendingAddition {
  userId: number;
  url: string;
  scrapedData: any;
  timestamp: number;
}
const pendingAdditions = new Map<string, PendingAddition>();

class TelegramBotManager {
  private activeLoops = new Map<string, boolean>();
  private offsets = new Map<string, number>();

  async start() {
    try {
      const bots = await userQueries.findAllTelegramBots();
      for (const bot of bots) {
        this.startPolling(bot.telegram_bot_token);
      }
    } catch (error) {
      console.error('[TelegramBot] Failed to start bots:', error);
    }
  }

  async syncBot(token: string | null) {
    if (!token) return;
    if (!this.activeLoops.has(token)) {
      this.startPolling(token);
    }
  }

  private async startPolling(token: string) {
    if (this.activeLoops.get(token)) return;
    this.activeLoops.set(token, true);
    
    console.log(`[TelegramBot] Started polling for token starting with ${token.substring(0, 5)}...`);
    
    // Fire and forget loop
    this.poll(token).catch(err => console.error(`[TelegramBot] Polling error:`, err));
  }

  private async poll(token: string) {
    while (this.activeLoops.get(token)) {
      try {
        const offset = this.offsets.get(token) || 0;
        const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
          params: {
            offset,
            timeout: 30, // Long polling timeout
            allowed_updates: ['message', 'callback_query']
          },
          timeout: 35000 // Slightly longer than long polling timeout
        });

        const updates = response.data.result;
        for (const update of updates) {
          this.offsets.set(token, update.update_id + 1);
          await this.handleUpdate(token, update);
        }
      } catch (error: any) {
        if (error.response?.status === 401 || error.response?.status === 404) {
          console.error(`[TelegramBot] Invalid token ${token.substring(0, 5)}... stopping polling.`);
          this.activeLoops.delete(token);
          break;
        }
        // Network error, wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleUpdate(token: string, update: any) {
    try {
      if (update.message && update.message.text) {
        await this.handleMessage(token, update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(token, update.callback_query);
      }
    } catch (error) {
      console.error(`[TelegramBot] Error handling update:`, error);
    }
  }

  private async handleMessage(token: string, message: any) {
    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    const user = await userQueries.findByTelegramChatId(chatId);
    if (!user) {
      if (text.startsWith('/start')) {
        await this.sendMessage(token, chatId, "👋 Welcome to PriceGhost! To receive notifications and manage your products, please add your Chat ID to the Settings page in the web dashboard.\n\nYour Chat ID is: `" + chatId + "`");
      }
      return;
    }

    if (text.startsWith('/start') || text.startsWith('/help')) {
      await this.sendMessage(token, chatId, 
        "👻 **PriceGhost Bot Commands**\n\n" +
        "• `/list` - View all your tracked products\n" +
        "• `/add <url>` - Track a new product (or just paste a URL!)\n" +
        "• `/check` - Force a price check for all your products right now\n" +
        "• `/remove <id>` - Stop tracking a product\n" +
        "• `/help` - Show this menu"
      );
    } else if (text.startsWith('/list')) {
      await this.handleList(token, chatId, user.id);
    } else if (text.startsWith('/check')) {
      await this.handleCheck(token, chatId, user.id);
    } else if (text.startsWith('/remove ')) {
      await this.handleRemove(token, chatId, user.id, text.substring(8).trim());
    } else if (text.startsWith('/add ') || text.startsWith('http')) {
      const url = text.startsWith('/add ') ? text.substring(5).trim() : text;
      await this.handleAdd(token, chatId, user.id, url);
    } else {
      await this.sendMessage(token, chatId, "I didn't understand that command. Send /help to see what I can do.");
    }
  }

  private async handleList(token: string, chatId: string, userId: number) {
    try {
      const products = await productQueries.findByUserIdWithSparkline(userId);
      if (products.length === 0) {
        await this.sendMessage(token, chatId, "You aren't tracking any products yet. Send `/add <url>` to get started!");
        return;
      }

      let message = "📦 **Your Tracked Products:**\n\n";
      for (const p of products) {
        const priceStr = p.current_price !== null ? `${p.currency === 'USD' ? '$' : p.currency}${p.current_price}` : 'Unknown';
        const stockIcon = p.stock_status === 'in_stock' ? '✅' : (p.stock_status === 'out_of_stock' ? '❌' : '❓');
        message += `*ID:* ${p.id} - [${p.name || 'Unnamed Product'}](${p.url})\n`;
        message += `*Price:* ${priceStr} | *Stock:* ${stockIcon}\n\n`;
      }
      
      await this.sendMessage(token, chatId, message, {
        inline_keyboard: [[{ text: 'Refresh Prices', callback_data: 'cmd_check' }]]
      });
    } catch (e) {
      console.error("[TelegramBot] list error:", e);
      await this.sendMessage(token, chatId, "❌ Failed to fetch your products.");
    }
  }

  private async handleCheck(token: string, chatId: string, userId: number) {
    await this.sendMessage(token, chatId, "🔄 Forcing a price check for all your products. Please wait...");
    
    try {
      const products = await productQueries.findByUserIdWithSparkline(userId);
      let checked = 0;
      for (const p of products) {
        // Trigger a fake immediate refresh by clearing next_check_at or just running the scrape
        // We will just update next_check_at to now for the scheduler to pick it up in a minute
        await productQueries.updateLastChecked(p.id, 0); // Setting interval to 0 effectively puts it in the past
        checked++;
      }
      
      await this.sendMessage(token, chatId, `✅ Marked ${checked} products for an immediate price check. They will be updated shortly!`);
    } catch (e) {
      console.error("[TelegramBot] check error:", e);
      await this.sendMessage(token, chatId, "❌ Failed to force price check.");
    }
  }

  private async handleRemove(token: string, chatId: string, userId: number, productIdStr: string) {
    const productId = parseInt(productIdStr, 10);
    if (isNaN(productId)) {
      await this.sendMessage(token, chatId, "❌ Invalid product ID. Use `/remove <number>`");
      return;
    }
    
    try {
      const product = await productQueries.findById(productId, userId);
      if (!product) {
        await this.sendMessage(token, chatId, "❌ Product not found or you don't have permission to remove it.");
        return;
      }
      
      await productQueries.delete(productId, userId);
      await this.sendMessage(token, chatId, `🗑️ Removed product **${product.name || productId}** from your tracking list.`);
    } catch (e) {
      console.error("[TelegramBot] remove error:", e);
      await this.sendMessage(token, chatId, "❌ Failed to remove product.");
    }
  }

  private async handleAdd(token: string, chatId: string, userId: number, url: string) {
    if (!url.startsWith('http')) {
      await this.sendMessage(token, chatId, "❌ Invalid URL. Please provide a full URL starting with http:// or https://");
      return;
    }

    const msgInfo = await this.sendMessage(token, chatId, "🔍 Scraping product data, please wait...", undefined, true);
    let msgId = msgInfo?.result?.message_id;

    try {
      const scrapedData = await scrapeProductWithVoting(url, userId);
      const candidates = scrapedData.priceCandidates.length > 0
        ? scrapedData.priceCandidates
        : scrapedData.price
          ? [{
              price: scrapedData.price.price,
              currency: scrapedData.price.currency,
              method: scrapedData.selectedMethod || 'ai',
              context: 'Extracted price',
              confidence: 0.8
            }]
          : [];
      
      const pId = Math.random().toString(36).substring(7);
      pendingAdditions.set(pId, {
        userId,
        url,
        scrapedData,
        timestamp: Date.now()
      });

      const buttons = [];
      if (candidates.length > 0) {
        // Build inline keyboard
        for (let i = 0; i < Math.min(candidates.length, 3); i++) {
          const c = candidates[i];
          buttons.push([{
            text: `${c.currency === 'USD' ? '$' : c.currency}${c.price} (${c.method})`,
            callback_data: `add_${pId}_${i}`
          }]);
        }
      }
      
      buttons.push([{ text: "❌ Mark Out of Stock", callback_data: `add_${pId}_oos` }]);
      buttons.push([{ text: "🚫 Cancel", callback_data: `add_${pId}_cancel` }]);

      const text = `🛒 **Product:** ${scrapedData.name || 'Unknown'}\n\nPlease verify the price or mark it as out of stock.`;
      
      if (msgId) {
         // Update existing message
         await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
            chat_id: chatId,
            message_id: msgId,
            text,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
         }).catch(e => console.error("Edit error", e));
      } else {
        await this.sendMessage(token, chatId, text, { inline_keyboard: buttons });
      }

    } catch (e) {
      console.error("[TelegramBot] add error:", e);
      if (msgId) {
        await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
            chat_id: chatId,
            message_id: msgId,
            text: "❌ Failed to scrape the product. The site might be blocking us.",
         }).catch(e => console.error("Edit error", e));
      } else {
        await this.sendMessage(token, chatId, "❌ Failed to scrape the product. The site might be blocking us.");
      }
    }
  }

  private async handleCallbackQuery(token: string, callbackQuery: any) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id.toString();
    const messageId = callbackQuery.message.message_id;

    try {
      if (data === 'cmd_check') {
        const user = await userQueries.findByTelegramChatId(chatId);
        if (user) await this.handleCheck(token, chatId, user.id);
      } else if (data.startsWith('add_')) {
        const parts = data.split('_');
        const pId = parts[1];
        const action = parts[2];

        const pending = pendingAdditions.get(pId);
        if (!pending) {
          await this.editMessage(token, chatId, messageId, "❌ Session expired or invalid.");
          return;
        }

        if (action === 'cancel') {
          await this.editMessage(token, chatId, messageId, "🚫 Product addition cancelled.");
          pendingAdditions.delete(pId);
          return;
        }

        let finalStockStatus = pending.scrapedData.stockStatus;
        let finalPrice = null;
        let finalCurrency = 'USD';
        let finalMethod = 'ai';

        if (action === 'oos') {
          finalStockStatus = 'out_of_stock';
        } else {
          // It's an index
          const idx = parseInt(action, 10);
          const candidates = pending.scrapedData.priceCandidates.length > 0 
            ? pending.scrapedData.priceCandidates 
            : (pending.scrapedData.price ? [pending.scrapedData.price] : []);
          
          if (candidates[idx]) {
            finalPrice = candidates[idx].price;
            finalCurrency = candidates[idx].currency;
            finalMethod = candidates[idx].method || 'ai';
          }
        }

        const product = await productQueries.create(
          pending.userId,
          pending.url,
          pending.scrapedData.name,
          pending.scrapedData.imageUrl,
          3600,
          finalStockStatus
        );

        if (finalPrice !== null) {
          await productQueries.updateExtractionMethod(product.id, finalMethod);
          await productQueries.updateAnchorPrice(product.id, finalPrice);
          await priceHistoryQueries.create(product.id, finalPrice, finalCurrency, null);
        }

        if (finalStockStatus !== 'unknown') {
          await stockStatusHistoryQueries.recordChange(product.id, finalStockStatus);
        }

        await productQueries.updateLastChecked(product.id, 3600);
        pendingAdditions.delete(pId);

        await this.editMessage(token, chatId, messageId, `✅ Successfully added **${pending.scrapedData.name || 'Product'}** to your tracking list!`);
      }

      // Answer callback query to remove loading state
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id
      }).catch(() => {});
    } catch (e) {
      console.error("[TelegramBot] callback query error", e);
      await this.editMessage(token, chatId, messageId, "❌ An error occurred processing your request.");
    }
  }

  private async editMessage(token: string, chatId: string, messageId: number, text: string) {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown'
      });
    } catch (e) {}
  }

  // Modified to optionally return response data
  private async sendMessage(token: string, chatId: string, text: string, replyMarkup?: any, returnData = false) {
    try {
      const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
      if (returnData) return res.data;
    } catch (e: any) {
      console.error("[TelegramBot] Error sending message:", e?.response?.data || e.message);
    }
  }
}

export const telegramBotManager = new TelegramBotManager();
