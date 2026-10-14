import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Módulo GLOBAL: cualquier módulo (ordenes, cocina, caja) podrá
 * inyectar RealtimeGateway y emitir eventos sin importarlo
 * manualmente en cada uno.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
