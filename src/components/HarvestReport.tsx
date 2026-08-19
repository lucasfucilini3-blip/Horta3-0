import React, { useState } from 'react';
import { Sale, ProduceCatalogItem, InventoryItem, SaleItem } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, Search, Calendar, Printer, CheckSquare, Square, Truck, AlertTriangle, RefreshCw, ChevronDown, Check, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getCanonicalProductName, normalizeProductName } from '../productUtils';

interface HarvestReportProps {
  sales: Sale[];
  produceCatalog: ProduceCatalogItem[];
  inventory: InventoryItem[];
}

const getDeliveryDate = (sale: Sale): Date | null => {
  const targetDate = sale.deliveryDate || sale.createdAt;
  if (!targetDate) return null;
  if (typeof (targetDate as any).toDate === 'function') {
    return (targetDate as any).toDate();
  }
  return new Date(targetDate);
};

export default function HarvestReport({ sales, produceCatalog, inventory }: HarvestReportProps) {
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'custom'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'own' | 'third_party'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [checkedProducts, setCheckedProducts] = useState<string[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const formatUnit = (unit: string, qty: number = 1) => {
    const u = (unit || '').toLowerCase().trim();
    if (
      u === 'pé' || 
      u === 'pe' || 
      u === 'pés' || 
      u === 'pes' || 
      u === 'pés de alface' || 
      u === 'pé de alface' ||
      u === 'pacote' ||
      u === 'pacotes' ||
      u.includes('pe de') ||
      u.includes('pe d') ||
      u.includes('pé de') ||
      u.includes('pés de')
    ) {
      return 'pct';
    }
    return unit;
  };

  const findUnitForProduct = (name: string) => {
    const catalogItem = produceCatalog.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (catalogItem) return catalogItem.unit;
    const inventoryItem = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (inventoryItem) return inventoryItem.unit;
    return 'un'; // default fallback
  };

  // Filter and aggregate pending delivery and normal sales
  const getAggregatedHarvestItems = () => {
    const pendingSales = sales.filter(sale => {
      // 1. Only pending delivery or ordered status
      const isPending = sale.status === 'pending_delivery' || sale.status === 'ordered' || sale.status === 'pending';
      if (!isPending) return false;

      // 2. Date filtering
      if (dateFilter === 'all') return true;

      const delDate = getDeliveryDate(sale);
      if (!delDate) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const saleDay = new Date(delDate);
      saleDay.setHours(0, 0, 0, 0);

      if (dateFilter === 'today') {
        return saleDay.getTime() === today.getTime();
      }

      if (dateFilter === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return saleDay.getTime() === tomorrow.getTime();
      }

      if (dateFilter === 'week') {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + 7);
        return saleDay >= today && saleDay <= endOfWeek;
      }

      if (dateFilter === 'custom') {
        if (!startDate && !endDate) return true;
        let match = true;
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          match = match && saleDay >= start;
        }
        if (endDate) {
          const end = new Date(endDate + 'T23:59:59');
          match = match && saleDay <= end;
        }
        return match;
      }

      return true;
    });

    const aggregation: Record<string, {
      name: string;
      totalQty: number;
      unit: string;
      source: 'own_production' | 'third_party';
      customers: Array<{ customerName: string; quantity: number; deliveryDate: any; isDelivery: boolean; observations?: string }>;
    }> = {};

    pendingSales.forEach(sale => {
      sale.items.forEach(item => {
        const itemSource: 'own_production' | 'third_party' = item.source === 'third_party' ? 'third_party' : 'own_production';
        
        // Filter by origin if selected
        if (originFilter === 'own' && itemSource === 'third_party') return;
        if (originFilter === 'third_party' && itemSource === 'own_production') return;

        const canonicalName = getCanonicalProductName(item.name);
        const itemUnit = item.unit || findUnitForProduct(canonicalName) || findUnitForProduct(item.name);
        const normKey = `${normalizeProductName(item.name)}_${itemUnit}_${itemSource}`;
        const qty = item.quantity;
        
        if (!aggregation[normKey]) {
          aggregation[normKey] = {
            name: canonicalName,
            totalQty: 0,
            unit: itemUnit,
            source: itemSource,
            customers: []
          };
        }

        aggregation[normKey].totalQty += qty;
        aggregation[normKey].customers.push({
          customerName: sale.customerName,
          quantity: qty,
          deliveryDate: sale.deliveryDate || sale.createdAt,
          isDelivery: !!sale.isDelivery,
          observations: sale.observations || sale.observations === '' ? sale.observations : undefined
        });
      });
    });

    let list = Object.values(aggregation);
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(searchLower));
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  };

  const aggregatedItems = getAggregatedHarvestItems();

  const handleToggleProduct = (name: string) => {
    if (checkedProducts.includes(name)) {
      setCheckedProducts(checkedProducts.filter(p => p !== name));
    } else {
      setCheckedProducts([...checkedProducts, name]);
    }
  };

  const handleClearChecked = () => {
    if (window.confirm('Deseja limpar todos os itens marcados como colhidos?')) {
      setCheckedProducts([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate some simple metrics
  const totalItemsToHarvest = aggregatedItems.reduce((acc, item) => acc + item.totalQty, 0);
  const checkedItemsCount = aggregatedItems.filter(item => checkedProducts.includes(item.name)).length;

  return (
    <div className="space-y-6">
      {/* Header do Relatório */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="text-emerald-600" size={26} />
            📋 Lista de Colheita de Pedidos
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            Veja as quantidades consolidadas de cada produto pendente de entrega para facilitar o planejamento e a colheita na horta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {checkedProducts.length > 0 && (
            <button
              onClick={handleClearChecked}
              className="flex-1 sm:flex-none py-2.5 px-4 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-rose-100"
            >
              <RefreshCw size={14} />
              Limpar Marcados
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none py-2.5 px-5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-100 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer border border-emerald-500"
          >
            <Printer size={15} />
            Imprimir Lista
          </button>
        </div>
      </div>

      {/* Filtros de Data e Busca (Escondidos na Impressão) */}
      <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row gap-4 justify-between">
          {/* Seletor de Período */}
          <div className="space-y-2 flex-1">
            <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Filtrar por Data de Entrega</label>
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
              {[
                { id: 'all', label: 'Todas as Datas' },
                { id: 'today', label: 'Hoje' },
                { id: 'tomorrow', label: 'Amanhã' },
                { id: 'week', label: 'Próximos 7 Dias' },
                { id: 'custom', label: 'Personalizado' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setDateFilter(btn.id as any)}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    dateFilter === btn.id
                      ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro de Origem do Produto */}
          <div className="space-y-2 lg:w-72">
            <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Origem do Produto</label>
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setOriginFilter('all')}
                className={`flex-1 py-2 px-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                  originFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter('own')}
                className={`flex-1 py-2 px-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                  originFilter === 'own' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🌿 Horta
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter('third_party')}
                className={`flex-1 py-2 px-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                  originFilter === 'third_party' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🛒 Terceiros
              </button>
            </div>
          </div>

          {/* Busca de Produto */}
          <div className="space-y-2 lg:w-72">
            <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Buscar por Produto</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Ex: Alface, Rúcula, Tomate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-semibold text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Inputs de Data Personalizada */}
        {dateFilter === 'custom' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100"
          >
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Data Inicial</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Data Final</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Cards de Resumo Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Produtos Distintos</span>
            <span className="text-3xl font-black text-slate-800 block mt-1">{aggregatedItems.length}</span>
          </div>
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-500">
            <ClipboardList size={18} />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total de Itens</span>
            <span className="text-3xl font-black text-emerald-600 block mt-1">{totalItemsToHarvest}</span>
          </div>
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <Truck size={18} />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Progresso de Colheita</span>
            <span className="text-2xl font-black text-indigo-600 block mt-1.5">
              {checkedItemsCount} de {aggregatedItems.length} ({aggregatedItems.length > 0 ? Math.round((checkedItemsCount / aggregatedItems.length) * 100) : 0}%)
            </span>
          </div>
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <CheckSquare size={18} />
          </div>
        </div>
      </div>

      {/* LISTA IMPRESSA EXCLUSIVA (Aparece apenas ao imprimir) */}
      <div className="hidden print:block bg-white text-black p-4 space-y-6">
        <div className="text-center border-b pb-4">
          <h1 className="text-2xl font-bold">Relatório de Colheita</h1>
          <p className="text-xs text-gray-500 mt-1">
            Gerado em: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
          <p className="text-xs font-bold text-emerald-700 mt-1">
            Filtro de Data: {
              dateFilter === 'all' ? 'Todas as Datas Pendentes' :
              dateFilter === 'today' ? 'Hoje' :
              dateFilter === 'tomorrow' ? 'Amanhã' :
              dateFilter === 'week' ? 'Próximos 7 Dias' :
              `Personalizado (${startDate} até ${endDate})`
            }
          </p>
        </div>

        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left text-xs font-bold">Produto</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-bold w-24">Qtd Total</th>
              <th className="border border-gray-300 p-2 text-left text-xs font-bold">Destino / Clientes</th>
              <th className="border border-gray-300 p-2 text-center text-xs font-bold w-20">Colhido [ ]</th>
            </tr>
          </thead>
          <tbody>
            {aggregatedItems.map((item) => (
              <tr key={item.name} className="hover:bg-gray-50">
                <td className="border border-gray-300 p-2 text-xs font-bold">{item.name}</td>
                <td className="border border-gray-300 p-2 text-center text-xs font-black">
                  {Number.isInteger(item.totalQty) ? item.totalQty : item.totalQty.toFixed(2)} {formatUnit(item.unit, item.totalQty)}
                </td>
                <td className="border border-gray-300 p-2 text-xs text-gray-700">
                  <div className="space-y-1">
                    {item.customers.map((c, idx) => {
                      const cDate = c.deliveryDate ? (c.deliveryDate.toDate ? c.deliveryDate.toDate() : new Date(c.deliveryDate)) : null;
                      const cQtyFormatted = Number.isInteger(c.quantity) ? c.quantity : c.quantity.toFixed(2);
                      return (
                        <div key={idx} className="text-[10px]">
                          • <b>{c.customerName}</b> ({c.isDelivery ? 'Delivery' : 'Venda Normal'}): {cQtyFormatted} {formatUnit(item.unit, c.quantity)}
                          {cDate && ` (Entrega: ${format(cDate, 'dd/MM/yy')})`}
                          {c.observations && <span className="text-gray-500 block pl-2 font-medium">Obs: {c.observations}</span>}
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="border border-gray-300 p-2 text-center text-xs font-mono">
                  [  ]
                </td>
              </tr>
            ))}
            {aggregatedItems.length === 0 && (
              <tr>
                <td colSpan={4} className="border border-gray-300 p-4 text-center text-xs text-gray-500 font-bold">
                  Nenhum produto pendente de entrega para o período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Lista de Itens para Exibição Interativa na Tela */}
      <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <span className="text-sm font-black text-slate-800">
            Produtos a Colher ({aggregatedItems.length})
          </span>
          <span className="text-xs text-slate-400 font-bold">
            Clique no item para ver o detalhamento dos clientes
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {aggregatedItems.map((item) => {
            const isChecked = checkedProducts.includes(item.name);
            const isExpanded = expandedProduct === item.name;

            return (
              <div
                key={item.name}
                className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                  isChecked 
                    ? 'bg-slate-50/50 border-slate-200 opacity-60' 
                    : 'bg-white border-slate-200 hover:border-emerald-300 shadow-sm'
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="flex items-center justify-between p-4 gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleProduct(item.name)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
                    >
                      {isChecked ? (
                        <CheckSquare className="text-emerald-600 stroke-[2.5]" size={22} />
                      ) : (
                        <Square className="text-slate-300 stroke-[2.5]" size={22} />
                      )}
                    </button>

                    <div 
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedProduct(isExpanded ? null : item.name)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-sm md:text-base font-black text-slate-800 block truncate ${isChecked ? 'line-through text-slate-400 font-bold' : ''}`}>
                          {item.name}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${
                          item.source === 'third_party' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {item.source === 'third_party' ? '🛒 Terceiro / Revenda' : '🌿 Horta'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block mt-0.5">
                        {item.customers.length} {item.customers.length === 1 ? 'pedido' : 'pedidos pendentes'}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="flex items-center gap-3 shrink-0 cursor-pointer"
                    onClick={() => setExpandedProduct(isExpanded ? null : item.name)}
                  >
                    <span className={`text-base md:text-lg font-black px-4 py-1.5 rounded-xl ${
                      isChecked ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                    }`}>
                      {Number.isInteger(item.totalQty) ? item.totalQty : item.totalQty.toFixed(2)} {formatUnit(item.unit, item.totalQty)}
                    </span>
                    <ChevronDown 
                      size={18} 
                      className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    />
                  </div>
                </div>

                {/* Sub-lista expandida de Clientes */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100 bg-slate-50/50"
                    >
                      <div className="p-4 space-y-2.5">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Distribuição por Cliente:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.customers.map((c, idx) => {
                            const cDate = c.deliveryDate ? (c.deliveryDate.toDate ? c.deliveryDate.toDate() : new Date(c.deliveryDate)) : null;
                            return (
                              <div key={idx} className="bg-white p-3 rounded-xl border border-slate-150 shadow-xs flex flex-col justify-between">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black text-slate-800 truncate">{c.customerName}</span>
                                    <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                                      {c.isDelivery ? '🚀 Delivery' : '📦 Venda Normal'}
                                    </span>
                                  </div>
                                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg shrink-0">
                                    {c.quantity} {formatUnit(item.unit, c.quantity)}
                                  </span>
                                </div>
                                {cDate && (
                                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                                    <Calendar size={10} />
                                    {format(cDate, 'dd/MM/yyyy')}
                                  </span>
                                )}
                                {c.observations && (
                                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 font-medium leading-normal">
                                    <b>Obs:</b> {c.observations}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {aggregatedItems.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <ClipboardList className="mx-auto mb-3 text-slate-300" size={40} />
              <p className="font-bold text-slate-500">Nenhum produto para colheita</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Não há pedidos de entrega ativos ou agendados pendentes para o período filtrado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
