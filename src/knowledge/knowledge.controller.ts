import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  UseGuards, 
  Param, 
  Put, 
  Delete, 
  UseInterceptors, 
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@UseGuards(ApiKeyGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('/upload/:userId')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      console.log('File upload details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        fieldname: file.fieldname,
        encoding: file.encoding
      });

      // More permissive file type checking
      const allowedTypes = [
        'text/plain',
        'text/csv',
        'application/json',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Add more permissive types
        'text/x-csv',
        'text/comma-separated-values',
        'application/csv',
        'application/excel',
        'application/x-csv',
        'application/x-excel',
        'application/x-msexcel',
        'text/anytext',
        'text/*'
      ];

      // Check by file extension as fallback
      const fileExtension = file.originalname?.toLowerCase().split('.').pop();
      const allowedExtensions = ['txt', 'csv', 'json', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];

      if (
        allowedTypes.includes(file.mimetype) ||
        file.mimetype.startsWith('text/') ||
        (fileExtension && allowedExtensions.includes(fileExtension))
      ) {
        console.log('File type accepted:', file.mimetype);
        cb(null, true);
      } else {
        console.error('File type rejected:', {
          mimetype: file.mimetype,
          extension: fileExtension,
          allowedTypes: allowedTypes,
          allowedExtensions: allowedExtensions
        });
        cb(new BadRequestException(`Invalid file type: ${file.mimetype}. Please use text, CSV, JSON, PDF, or Word files.`), false);
      }
    }
  }))
  async uploadFile(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { category: string }
  ) {
    try {
      console.log('Upload request received:', {
        userId,
        filename: file?.originalname,
        mimetype: file?.mimetype,
        size: file?.size,
        category: body.category
      });

      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      if (!body.category) {
        throw new BadRequestException('Category is required');
      }

      return await this.knowledgeService.processUploadedFile(userId, file, body.category);
    } catch (error) {
      console.error('Upload processing error:', error);
      throw error;
    }
  }

  @Post('/scrape/:userId')
  async scrapeWebsite(
    @Param('userId') userId: string,
    @Body('url') url: string
  ) {
    return this.knowledgeService.scrapeAndSave(url, userId);
  }

  @Post('/:userId')
  async createKnowledge(
    @Param('userId') userId: string,
    @Body() body: { title: string; content: string; category: string; source?: string }
  ) {
    return this.knowledgeService.createKnowledge(userId, body);
  }

  @Get('/:userId')
  async getByUserId(@Param('userId') userId: string) {
    return this.knowledgeService.getKnowledgeByUserId(userId);
  }

  @Get()
  async getAll() {
    return this.knowledgeService.getAllKnowledge();
  }

  @Put('/:id/:userId')
  async updateKnowledge(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() updates: Partial<{ title: string; content: string; favicon: string; category: string }>
  ) {
    return this.knowledgeService.updateKnowledge(id, userId, updates);
  }

  @Delete('/:id/:userId')
  async deleteKnowledge(@Param('id') id: string, @Param('userId') userId: string) {
    return this.knowledgeService.deleteKnowledge(id, userId);
  }
}