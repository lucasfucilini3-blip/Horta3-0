import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Task } from '../types';
import { 
  Plus, 
  CheckCircle2, 
  Circle, 
  Calendar, 
  Clock, 
  Trash2, 
  AlertCircle,
  Flag,
  Search,
  Filter,
  XCircle,
  Check,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, handleFirestoreError, OperationType } from '../App';

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
      setLoading(false);
    }, (error) => {
      console.error("Tasks Error:", error);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const taskData = {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate + 'T12:00:00')) : null,
        priority,
      };

      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          completed: false,
          createdAt: serverTimestamp()
        });
      }
      
      setModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Save Task Error:", error);
      alert('Erro ao salvar tarefa: ' + (error.message || 'Verifique suas permissões.'));
      handleFirestoreError(error, OperationType.WRITE, 'tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setEditingTask(null);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(task.dueDate ? format(task.dueDate.toDate(), 'yyyy-MM-dd') : '');
    setPriority(task.priority);
    setModalOpen(true);
  };

  const toggleTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        completed: !task.completed,
        completedAt: !task.completed ? serverTimestamp() : null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Excluir esta tarefa?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error: any) {
      console.error("Delete Task Error:", error);
      alert('Erro ao excluir tarefa. Verifique suas permissões.');
      handleFirestoreError(error, OperationType.DELETE, 'tasks');
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' ? true : 
                         filter === 'completed' ? task.completed : !task.completed;
    return matchesSearch && matchesFilter;
  });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-100';
      default: return 'text-blue-600 bg-blue-50 border-blue-100';
    }
  };

  const getPriorityLabel = (p: string) => {
    switch (p) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      default: return 'Baixa';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Lista de Tarefas</h2>
          <p className="text-slate-500 mt-1">Gerencie as atividades diárias da horta.</p>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
        >
          <Plus size={20} />
          Nova Tarefa
        </button>
      </header>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          {(['pending', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all",
                filter === f ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === 'pending' ? 'Pendentes' : f === 'completed' ? 'Concluídas' : 'Todas'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar tarefas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="animate-spin text-emerald-600" size={32} />
          </div>
        ) : filteredTasks.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "group bg-white p-4 md:p-5 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center gap-4",
                  task.completed ? "border-slate-100 opacity-75" : "border-slate-200 hover:border-emerald-200 hover:shadow-md"
                )}
              >
                <button
                  onClick={() => toggleTask(task)}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0",
                    task.completed 
                      ? "bg-emerald-100 text-emerald-600" 
                      : "border-2 border-slate-200 text-transparent hover:border-emerald-400 hover:text-emerald-400"
                  )}
                >
                  {task.completed ? <Check size={18} strokeWidth={3} /> : <Check size={18} strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className={cn(
                      "font-bold text-slate-800 transition-all",
                      task.completed && "line-through text-slate-400"
                    )}>
                      {task.title}
                    </h3>
                    {!task.completed && (
                      <span className={cn(
                        "text-[10px] uppercase font-black px-2 py-0.5 rounded-full border",
                        getPriorityColor(task.priority)
                      )}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className={cn(
                      "text-sm text-slate-500 line-clamp-2",
                      task.completed && "line-through opacity-50"
                    )}>
                      {task.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    {task.dueDate && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                        <Calendar size={12} />
                        <span>{format(task.dueDate.toDate(), "dd 'de' MMM", { locale: ptBR })}</span>
                      </div>
                    )}
                    {task.completedAt && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                        <CheckCircle2 size={12} />
                        <span>Concluída em {format(task.completedAt.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => openEditModal(task)}
                    className="p-2 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-700">Tudo pronto!</h3>
            <p className="text-slate-400 mt-1">Nenhuma tarefa encontrada para este filtro.</p>
          </div>
        )}
      </div>

      {/* Task Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                      {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
                    </h3>
                    <p className="text-slate-500 text-sm font-medium">
                      {editingTask ? 'Atualize os detalhes da tarefa.' : 'O que precisa ser feito hoje?'}
                    </p>
                  </div>
                  <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={28} />
                  </button>
                </div>

                <form onSubmit={handleAddTask} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 ml-1 uppercase tracking-widest">Título da Tarefa</label>
                    <input 
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Irrigar canteiro 4"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 ml-1 uppercase tracking-widest">Descrição (Opcional)</label>
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Detalhes sobre a tarefa..."
                      rows={3}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 ml-1 uppercase tracking-widest">Prazo</label>
                      <input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 ml-1 uppercase tracking-widest">Prioridade</label>
                      <div className="flex p-1 bg-slate-50 border border-slate-200 rounded-2xl">
                        {(['low', 'medium', 'high'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPriority(p)}
                            className={cn(
                              "flex-1 py-3 px-2 rounded-xl text-xs font-black uppercase transition-all",
                              priority === p 
                                ? (p === 'low' ? "bg-blue-600 text-white shadow-md shadow-blue-100" :
                                   p === 'medium' ? "bg-amber-600 text-white shadow-md shadow-amber-100" :
                                   "bg-rose-600 text-white shadow-md shadow-rose-100")
                                : "text-slate-400 hover:text-slate-600"
                            )}
                          >
                            {getPriorityLabel(p)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Salvando...' : (editingTask ? 'Salvar Alterações' : 'Criar Tarefa')}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RefreshCw = ({ className, size }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export default Tasks;
