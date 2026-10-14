import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ namespace: '/', cors: { origin: '*' } })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('RealtimeGateway');

  // Nest inyecta aquí la instancia real del servidor Socket.IO
  // al montar el gateway. Sin esto, emitirAHouse reventaría con
  // "Cannot read properties of undefined (reading 'emit')".
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`Ping recibido de ${client.id}: ${JSON.stringify(data)}`);
    return {
      event: 'pong',
      data: { recibido: data, hora: new Date().toISOString() },
    };
  }

  /** Emisión a todos los clientes del namespace '/' (cocina, dashboards) */
  emitirAHouse(evento: string, payload: unknown): void {
    this.server.emit(evento, payload);
  }
}
