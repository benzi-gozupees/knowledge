import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Knowledge } from './knowledge.entity';
import { ScrapperService } from './scrapper.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Knowledge)
    private readonly knowledgeRepository: Repository<Knowledge>,
    private readonly scrapperService: ScrapperService,
  ) {}

  async scrapeAndSave(url: string, userId: string): Promise<Knowledge> {
    const scrapedData = await this.scrapperService.scrapeWebsite(url);
    let knowledge = await this.knowledgeRepository.findOne({ where: { source: scrapedData.source } });
    if (knowledge) {
      knowledge.title = scrapedData.title;
      knowledge.content = scrapedData.content;
      knowledge.favicon = scrapedData.favicon ?? '';
      knowledge.createdBy = userId;
      knowledge.orgId = 'external';
      // Keep existing category or set default
      if (!knowledge.category) {
        knowledge.category = 'Business Overview';
      }
    } else {
      knowledge = this.knowledgeRepository.create({
        title: scrapedData.title,
        content: scrapedData.content,
        source: scrapedData.source,
        favicon: scrapedData.favicon,
        category: 'Business Overview',
        createdBy: userId,
        orgId: 'external',
      } as Partial<Knowledge>);
    }
    return await this.knowledgeRepository.save(knowledge);
  }

  async getKnowledgeByUserId(userId: string) {
    return this.knowledgeRepository.find({
      where: { createdBy: userId },
    });
  }
  
  getAllKnowledge(): Promise<Knowledge[]> {
    return this.knowledgeRepository.find();
  }

  async updateKnowledge(id: string, userId: string, updates: Partial<Knowledge>): Promise<Knowledge> {
    const knowledge = await this.knowledgeRepository.findOne({ where: { id } });
  
    if (!knowledge) throw new NotFoundException('Knowledge not found');
    if (knowledge.createdBy !== userId) throw new ForbiddenException('You can only edit your own knowledge');
  
    Object.assign(knowledge, updates);
  
    return this.knowledgeRepository.save(knowledge);
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