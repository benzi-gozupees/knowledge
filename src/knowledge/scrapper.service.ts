import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class ScrapperService {
  async scrapeWebsite(url: string): Promise<{
    title: string;
    content: string;
    favicon: string | null;
    source: string;
  }> {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const title = $('title').text() || 'No title';
      const favicon = $('link[rel="icon"]').attr('href') || null;

      let content = '';
      $('p').each((_, el) => {
        content += $(el).text() + '\n';
      });

      return {
        title,
        content,
        favicon,
        source: url,
      };
    } catch (error) {
      throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
  }
}
