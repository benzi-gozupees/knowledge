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
    category?: string;
  }> {
    try {
      // Validate URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const { data } = await axios.get(url, {
        timeout: 15000, // Increased timeout to 15 seconds
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });
      
      const $ = cheerio.load(data);

      // Enhanced title extraction with multiple fallbacks
      const title = $('title').text().trim() || 
                   $('h1').first().text().trim() || 
                   $('meta[property="og:title"]').attr('content') || 
                   $('meta[name="title"]').attr('content') ||
                   $('meta[property="twitter:title"]').attr('content') ||
                   'No title';

      // Enhanced favicon extraction with multiple fallbacks
      let favicon = $('link[rel="icon"]').attr('href') || 
                   $('link[rel="shortcut icon"]').attr('href') || 
                   $('link[rel="apple-touch-icon"]').attr('href') ||
                   $('link[rel="apple-touch-icon-precomposed"]').attr('href') ||
                   $('meta[property="og:image"]').attr('content') ||
                   null;
      
      // Make favicon URL absolute if it's relative
      if (favicon && !favicon.startsWith('http')) {
        try {
          const baseUrl = new URL(url);
          if (favicon.startsWith('//')) {
            favicon = baseUrl.protocol + favicon;
          } else if (favicon.startsWith('/')) {
            favicon = baseUrl.origin + favicon;
          } else {
            favicon = new URL(favicon, baseUrl.origin).href;
          }
        } catch (faviconError) {
          console.warn('Failed to process favicon URL:', faviconError);
          favicon = null;
        }
      }

      // Enhanced content extraction - remove unwanted elements first
      $('script, style, nav, header, footer, aside, .advertisement, .ad, .cookie-banner, .popup, .modal, .sidebar, .related-posts, .comments, .social-share, .breadcrumbs, .pagination, .newsletter-signup').remove();

      let content = '';
      
      // Extract main content from various possible containers
      const contentSelectors = [
        'main',
        '[role="main"]',
        '.main-content',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        'article',
        '.page-content',
        '.content-wrapper',
        '.main-article',
        '.story-body'
      ];
      
      // Try to find main content container
      let foundMainContent = false;
      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.find('p, h1, h2, h3, h4, h5, h6, li, div, span').each((_, el) => {
            const text = $(el).text().trim();
            // Filter out navigation, ads, and other unwanted content
            if (text && 
                text.length > 15 && 
                !text.toLowerCase().includes('cookie') &&
                !text.toLowerCase().includes('subscribe') &&
                !text.toLowerCase().includes('newsletter') &&
                !text.toLowerCase().includes('advertisement') &&
                !text.toLowerCase().includes('follow us') &&
                !text.toLowerCase().includes('share this') &&
                !text.match(/^\s*\d+\s*$/) && // Skip numbers only
                !text.match(/^[^a-zA-Z]*$/) // Skip non-alphabetic content
               ) {
              content += text + '\n\n';
            }
          });
          if (content.trim()) {
            foundMainContent = true;
            break;
          }
        }
      }

      // Fallback: if no main content container found, extract from body
      if (!foundMainContent || !content.trim()) {
        $('body').find('p, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
          const text = $(el).text().trim();
          if (text && 
              text.length > 15 && 
              !text.toLowerCase().includes('cookie') &&
              !text.toLowerCase().includes('subscribe') &&
              !text.toLowerCase().includes('newsletter') &&
              !text.toLowerCase().includes('advertisement')
             ) {
            content += text + '\n\n';
          }
        });
      }

      // Final fallback: just paragraphs and headings
      if (!content.trim()) {
        $('p, h1, h2, h3, h4, h5, h6').each((_, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 10) {
            content += text + '\n\n';
          }
        });
      }

      // Clean up content
      content = content
        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
        .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
        .replace(/\t/g, ' ') // Replace tabs with spaces
        .trim();

      // Remove common unwanted patterns
      content = content
        .replace(/^(Home|Menu|Search|Login|Register|Subscribe|Newsletter).*$/gm, '')
        .replace(/^(Copyright|©|All rights reserved).*$/gm, '')
        .replace(/^(Privacy Policy|Terms of Service|Cookie Policy).*$/gm, '')
        .trim();

      if (!content || content.length < 50) {
        content = 'No meaningful content could be extracted from this page.';
      }

      // Determine category based on content and URL
      const category = this.determineCategory(url, title, content);

      return {
        title: title.substring(0, 200), // Limit title length
        content: content.substring(0, 15000), // Increased content length limit
        favicon,
        source: url,
        category
      };
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        throw new Error(`Website not found: ${url}`);
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused: ${url}`);
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error(`Request timeout: ${url}`);
      } else if (error.response?.status === 404) {
        throw new Error(`Page not found: ${url}`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access forbidden: ${url}`);
      } else if (error.response?.status >= 500) {
        throw new Error(`Server error: ${url}`);
      } else {
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
      }
    }
  }

  private determineCategory(url: string, title: string, content: string): string {
    const urlLower = url.toLowerCase();
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();

    // Check for specific patterns to determine category
    if (urlLower.includes('/about') || titleLower.includes('about') || contentLower.includes('about us')) {
      return 'Company Overview';
    }
    
    if (urlLower.includes('/service') || urlLower.includes('/product') || 
        titleLower.includes('service') || titleLower.includes('product') ||
        contentLower.includes('we offer') || contentLower.includes('our services')) {
      return 'Services & Products';
    }
    
    if (urlLower.includes('/contact') || titleLower.includes('contact') || 
        contentLower.includes('contact us') || contentLower.includes('get in touch')) {
      return 'Contact Information';
    }
    
    if (urlLower.includes('/pricing') || urlLower.includes('/price') || 
        titleLower.includes('pricing') || titleLower.includes('price') ||
        contentLower.includes('pricing') || contentLower.includes('cost')) {
      return 'Pricing';
    }
    
    if (urlLower.includes('/faq') || titleLower.includes('faq') || 
        titleLower.includes('frequently asked') || contentLower.includes('frequently asked')) {
      return 'FAQ';
    }
    
    if (urlLower.includes('/policy') || urlLower.includes('/privacy') || 
        urlLower.includes('/terms') || titleLower.includes('policy') ||
        titleLower.includes('privacy') || titleLower.includes('terms')) {
      return 'Policies';
    }

    // Default category
    return 'Business Overview';
  }
}