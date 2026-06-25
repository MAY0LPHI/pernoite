# VTR Noturno — Controle de Pernoite no Estacionamento

## Problema Original
Sistema para o funcionário do shopping controlar veículos que ficam de pernoite. Hoje conta carro por carro manualmente. O sistema permite tirar foto da placa, reconhece via IA (Gemini Vision), organiza por setor, e gera ao final mensagem formatada para WhatsApp.

## Persona
- **Vigia/Operador noturno**: usa o app no celular, à noite, no estacionamento. Precisa de UI mobile, botões grandes, fluxo rápido.

## Core Requirements (estáticos)
1. Iniciar pernoite com nome do colaborador, data e horários (default 18:00–06:00)
2. Lista de setores pré-cadastrados (ZARP LOCALIZA, CREDCARROS, SETOR AZUL/VERMELHO/LARANJA/VERDE, SETOR 01/02/03/05) + criar setores customizados
3. Por setor: scan via câmera (Gemini Vision) ou digitação manual de placa/marca/modelo/cor
4. Auto-aprendizado: cada placa cadastrada fica salva; próxima vez auto-completa
5. Mensagem final formatada e botão "Copiar Tudo" e "Abrir no WhatsApp"
6. Histórico por data, com filtro

## Implementado (2026-06-24)
- Backend FastAPI + MongoDB com endpoints: /api/sectors, /api/sessions, /api/scan/plate, /api/vehicles/{plate}, /api/sessions/{id}/export
- Integração Gemini Vision (gemini-3-flash-preview) via emergentintegrations + EMERGENT_LLM_KEY
- Seed automático de 10 setores padrão na inicialização
- Auto-learning de veículos no PUT de sessão
- Frontend React (mobile-first) tactical dark mode: Home, Session, Scan, Review, History, HistoryDetail, SectorsManage
- Compressão de imagem no cliente antes do envio (max 1280px, q=0.82)
- Toasts via Sonner; design fontes Oswald/Manrope/JetBrains Mono
- Testing: 17/18 backend tests pass (1 conditional skip por imagem de teste)

## Backlog (P1)
- Suporte a múltiplas placas em uma única foto (lote)
- Edição inline de placa adicionada
- Export CSV/PDF além do WhatsApp
- Notas/observações por veículo

## Backlog (P2)
- PWA com cache offline para finalizar quando sem rede
- Estatísticas (mais frequentes, novos veículos)
- Login multiusuário (caso o shopping queira separar por turno)
