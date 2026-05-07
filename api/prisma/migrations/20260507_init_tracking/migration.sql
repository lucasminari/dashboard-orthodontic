-- CreateTable
CREATE TABLE "tracking_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "unidade_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_push_subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_stage_transitions" (
    "id" BIGSERIAL NOT NULL,
    "kommo_lead_id" BIGINT NOT NULL,
    "unidade_id" INTEGER,
    "de_status" TEXT,
    "para_status" TEXT NOT NULL,
    "ocorreu_em" TIMESTAMP(3) NOT NULL,
    "fonte" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_stage_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_attention_items" (
    "id" BIGSERIAL NOT NULL,
    "kommo_lead_id" BIGINT NOT NULL,
    "unidade_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "motivo_detalhe" JSONB,
    "prioridade" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "detectado_em" TIMESTAMP(3) NOT NULL,
    "visto_em" TIMESTAMP(3),
    "visto_por" INTEGER,
    "resolvido_em" TIMESTAMP(3),
    "resolvido_por" INTEGER,
    "ultima_atualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_attention_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_attention_events" (
    "id" BIGSERIAL NOT NULL,
    "attention_item_id" BIGINT NOT NULL,
    "evento" TEXT NOT NULL,
    "por_usuario_id" INTEGER,
    "ocorreu_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "tracking_attention_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_sync_runs" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "iniciado_em" TIMESTAMP(3) NOT NULL,
    "terminado_em" TIMESTAMP(3),
    "leads_processados" INTEGER,
    "novos" INTEGER,
    "atualizados" INTEGER,
    "erros" JSONB,
    "status" TEXT,

    CONSTRAINT "tracking_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_users_email_key" ON "tracking_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_push_subscriptions_usuario_id_endpoint_key" ON "tracking_push_subscriptions"("usuario_id", "endpoint");

-- CreateIndex
CREATE INDEX "tracking_stage_transitions_kommo_lead_id_ocorreu_em_idx" ON "tracking_stage_transitions"("kommo_lead_id", "ocorreu_em" DESC);

-- CreateIndex
CREATE INDEX "tracking_stage_transitions_unidade_id_ocorreu_em_idx" ON "tracking_stage_transitions"("unidade_id", "ocorreu_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_stage_transitions_kommo_lead_id_ocorreu_em_para_st_key" ON "tracking_stage_transitions"("kommo_lead_id", "ocorreu_em", "para_status");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_attention_items_kommo_lead_id_key" ON "tracking_attention_items"("kommo_lead_id");

-- CreateIndex
CREATE INDEX "tracking_attention_items_unidade_id_status_prioridade_detec_idx" ON "tracking_attention_items"("unidade_id", "status", "prioridade", "detectado_em");

-- CreateIndex
CREATE INDEX "tracking_attention_items_status_prioridade_idx" ON "tracking_attention_items"("status", "prioridade");

-- CreateIndex
CREATE INDEX "tracking_attention_events_attention_item_id_ocorreu_em_idx" ON "tracking_attention_events"("attention_item_id", "ocorreu_em");

-- CreateIndex
CREATE INDEX "tracking_sync_runs_tipo_iniciado_em_idx" ON "tracking_sync_runs"("tipo", "iniciado_em" DESC);

-- AddForeignKey
ALTER TABLE "tracking_push_subscriptions" ADD CONSTRAINT "tracking_push_subscriptions_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "tracking_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_attention_items" ADD CONSTRAINT "tracking_attention_items_visto_por_fkey" FOREIGN KEY ("visto_por") REFERENCES "tracking_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_attention_items" ADD CONSTRAINT "tracking_attention_items_resolvido_por_fkey" FOREIGN KEY ("resolvido_por") REFERENCES "tracking_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_attention_events" ADD CONSTRAINT "tracking_attention_events_attention_item_id_fkey" FOREIGN KEY ("attention_item_id") REFERENCES "tracking_attention_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_attention_events" ADD CONSTRAINT "tracking_attention_events_por_usuario_id_fkey" FOREIGN KEY ("por_usuario_id") REFERENCES "tracking_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

