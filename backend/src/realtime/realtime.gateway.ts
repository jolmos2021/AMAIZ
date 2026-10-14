import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * La tubería de tiempo real del restaurante.
 *
 * Namespace '/' : pantalla de cocina y dashboards.
 * Namespace '/meseros': la app móvil (Fase 3.4) — separada para
 * poder emitir a un público u otro sin cruzar mensajes.
 *
 * Autenticación por JWT en el handshake (query token) — la
 * implementamos completa en el paso 3.2 junto con las órdenes.
 */
@WebSocketGateway({ namespace: '/', cors: { origin: '*' } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('RealtimeGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  // Evento de prueba/saludo — lo usamos para validar la tubería en 3.1b
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`Ping recibido de ${client.id}: ${JSON.stringify(data)}`);
    return {
      event: 'pong',
      data: { recibido: data, hora: new Date().toISOString() },
    };
  }

  /**
   * Emisión de eventos a TODOS los clientes del namespace '/'.
   * Será invocado desde los services (ordenes, cocina) vía inyección.
   */
  emitirAHouse(evento: string, payload: unknown): void {
    this.server.emit(evento, payload);
  }

  private readonly server: Server;
}
