import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Knowledge } from './knowledge.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>
  ) {}

  

  async scrapeAndSave(data: { website_url: string; business_name: string; business_type: string }, userId: string): Promise<any> {
    const { website_url, business_name, business_type } = data;
    console.log(`Starting scrape for: ${website_url}`);
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    
    puppeteerExtra.default.use(StealthPlugin());
    
    const puppeteer = puppeteerExtra.default;
    
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const visited = new Set<string>();
    const toVisit = [website_url];
    const baseDomain = new URL(website_url).hostname;
    const scrapedPages: { url: string; html: string; title: string; text: string }[] = [];
  
    const page = await browser.newPage();
    console.log(`Browser launched. Starting crawl loop...`);
    while (toVisit.length > 0 && visited.size < 5) {
      const currentUrl = toVisit.shift();
      if (!currentUrl || visited.has(currentUrl)) continue;
  
      try {
        console.log(`Visiting: ${currentUrl}`);
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        );
        
        await page.goto(currentUrl, { waitUntil: 'load', timeout: 100000 });
        console.log(`Loaded: ${currentUrl}`);
        visited.add(currentUrl);
  
        const html = await page.content();
        const title = await page.title();
        const text = await page.$eval('body', el => el.innerText || '');
  
        scrapedPages.push({
          url: currentUrl,
          html,
          title,
          text: text.trim().substring(0, 10000),
        });
  
        const links = await page.$$eval('a', anchors =>
          anchors
            .map(a => a.getAttribute('href'))
            .filter((href): href is string => !!href && !href.startsWith('javascript:'))
            .map(href => new URL(href, window.location.href).href)
        );
        console.log(`Found ${links.length} links on ${currentUrl}`);
        for (const link of links) {
          try {
            const parsed = new URL(link);
            if (
              parsed.hostname === baseDomain &&
              !visited.has(parsed.href) &&
              !toVisit.includes(parsed.href)
            ) {
              toVisit.push(parsed.href);
            }
          } catch (_) {}
        }
  
      } catch (err: any) {
        console.warn(`Failed to scrape ${currentUrl}: ${err.message}`);
      }
    }
  
    await browser.close();
  
    // Extract fields
    const combinedText = scrapedPages.map(p => p.text).join('\n');
  
    const extractField = (regex: RegExp, fallback = '') => {
      const match = regex.exec(combinedText);
      return match ? match[1].trim() : fallback;
    };
  
    const mandatoryFields = {
      services: extractField(/services?\s*[:\-]?\s*(.*)/i),
      opening_hours: extractField(/(opening|business)\s*hours?\s*[:\-]?\s*(.*)/i),
      contact_info: {
        phone: extractField(/(phone|tel)\s*[:\-]?\s*(\+?[0-9 \-().]+)/i),
        email: extractField(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/, ''),
        website: website_url,
      },
      address: extractField(/address\s*[:\-]?\s*(.*)/i),
      additional_notes: extractField(/(about|note|summary|history)\s*[:\-]?\s*(.*)/i),
    };
  
    const summaryText = `
  Business Name: ${business_name}
  Business Type: ${business_type}
  Website: ${website_url}
  
  Services: ${mandatoryFields.services}
  Opening Hours: ${mandatoryFields.opening_hours}
  Contact: ${mandatoryFields.contact_info.phone} | ${mandatoryFields.contact_info.email}
  Address: ${mandatoryFields.address}
  Additional Notes: ${mandatoryFields.additional_notes}
    `.trim();
  
    const existing = await this.knowledgeRepository.findOne({ where: { source: website_url } });
    let knowledge: Knowledge;
  
    if (existing) {
      existing.title = `${business_name} Overview`;
      existing.content = summaryText;
      existing.favicon = '';
      existing.createdBy = userId;
      existing.orgId = 'external';
      if (!existing.category) existing.category = 'Business Overview';
      knowledge = existing;
    } else {
      knowledge = this.knowledgeRepository.create({
        title: `${business_name} Overview`,
        content: summaryText,
        source: website_url,
        favicon: '',
        category: 'Business Overview',
        createdBy: userId,
        orgId: 'external',
      } as Partial<Knowledge>);
    }
  
    await this.knowledgeRepository.save(knowledge);
  
    return {
      status: 'success',
      mandatoryFields,
      pagesProcessed: scrapedPages.length,
      scrapedPages,
    };
  }
  
  // Get all entries created by a specific user
  async getKnowledgeByUserId(userId: string): Promise<Knowledge[]> {
    return this.knowledgeRepository.find({
      where: { createdBy: userId },
    });
  }
  
  // Get all entries
  getAllKnowledge(): Promise<Knowledge[]> {
    return this.knowledgeRepository.find();
  }
  
  // Update existing knowledge entry
  async updateKnowledge(id: string, userId: string, updates: Partial<Knowledge>): Promise<Knowledge> {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
  
    if (!knowledge) {
      throw new NotFoundException('Knowledge not found');
    }
  
    if (knowledge.createdBy !== userId) {
      throw new ForbiddenException('You can only edit your own knowledge');
    }
  
    Object.assign(knowledge, updates);
    return await this.knowledgeRepository.save(knowledge);
  }
  

  async createKnowledge(
    userId: string, 
    data: { title: string; content: string; category: string; source?: string }
  ): Promise<Knowledge> {
    const knowledge = this.knowledgeRepository.create({
      title: data.title,
      content: data.content,
      category: data.category,
      source: data.source || '',
      favicon: '',
      createdBy: userId,
      orgId: 'external',
    });

    return await this.knowledgeRepository.save(knowledge);
  }

  async processUploadedFile(
    userId: string, 
    file: Express.Multer.File, 
    category: string
  ): Promise<Knowledge> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    let content = '';
    const title = file.originalname;

    try {
      // Process different file types
      switch (file.mimetype) {
        case 'text/plain':
        case 'text/csv':
        case 'application/json':
          content = file.buffer.toString('utf-8');
          break;
          
        case 'application/pdf':
          // For PDF files - requires: npm install pdf-parse
          try {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(file.buffer);
            content = pdfData.text;
          } catch (pdfError) {
            throw new BadRequestException('Failed to process PDF file. Please ensure the file is not corrupted.');
          }
          break;
          
        case 'application/msword':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          // For Word files - requires: npm install mammoth
          try {
            const mammoth = require('mammoth');
            const docResult = await mammoth.extractRawText({ buffer: file.buffer });
            content = docResult.value;
          } catch (docError) {
            throw new BadRequestException('Failed to process Word document. Please ensure the file is not corrupted.');
          }
          break;
          
        default:
          // For unsupported types, try to treat as text
          try {
            content = file.buffer.toString('utf-8');
          } catch (textError) {
            throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
          }
      }

      // Clean up content
      content = content
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!content || content.length < 10) {
        throw new BadRequestException('No meaningful content could be extracted from the file');
      }

      // Create knowledge entry
      const knowledge = this.knowledgeRepository.create({
        title: title.substring(0, 200),
        content: content.substring(0, 10000),
        category: category,
        source: `File Upload: ${file.originalname}`,
        favicon: '',
        createdBy: userId,
        orgId: 'external',
      });

      return await this.knowledgeRepository.save(knowledge);

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to process file: ${error.message}`);
    }
  }
  
  async deleteKnowledge(id: string, userId: string): Promise<{ message: string }> {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
  
    if (!knowledge) throw new NotFoundException('Knowledge not found');
    if (knowledge.createdBy !== userId) throw new ForbiddenException('You can only delete your own knowledge');
  
    await this.knowledgeRepository.remove(knowledge);
    return { message: 'Knowledge deleted successfully' };
  }
}

function StealthPlugin(): import("puppeteer-extra").PuppeteerExtraPlugin {
  throw new Error('Function not implemented.');
}
