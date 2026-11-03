import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../auth/entities/user.entity';
import { XmiInteropService } from '../services/xmi-interop.service';
import { ImportXmiDto } from '../dtos/xmi-interop.dto';

@ApiTags('XMI Interoperability')
@ApiBearerAuth()
@Controller('xmi')
export class XmiController {
  constructor(private readonly xmiService: XmiInteropService) {}

  @Get('export/:diagramId')
  @ApiOperation({
    summary:
      'Exportar diagrama existente a archivo XMI 2.1 (Enterprise Architect v17)',
    description:
      'Genera el documento XML estándar XMI 2.1 con metadatos completos y la sección gráfica de diagramas/geometría compatible con Enterprise Architect v17 y suites CASE.',
  })
  @ApiParam({ name: 'diagramId', description: 'UUID del diagrama a exportar' })
  @ApiResponse({
    status: 200,
    description: 'Archivo XMI 2.1 generado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Diagrama no encontrado' })
  async exportDiagram(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { filename, xmiContent } = await this.xmiService.exportDiagramToXmi(
      diagramId,
      user.id,
    );
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(xmiContent);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Importar archivo XMI 2.1 (Enterprise Architect v17)',
    description:
      'Parsea el documento XML XMI 2.1 de Enterprise Architect, extrayendo clases, atributos, operaciones, relaciones y geometrías. Si se indica diagramId o projectId, persiste los cambios.',
  })
  @ApiResponse({
    status: 200,
    description: 'AST del diagrama importado y parseado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Estructura XMI inválida o corrupta',
  })
  async importXmi(@Body() dto: ImportXmiDto, @CurrentUser() user: User) {
    return this.xmiService.importXmi(dto, user.id);
  }
}
