import { useQuery } from '@tanstack/react-query';
import { fetchLastFinished } from './api';
import { examStatus, type ExamStatus } from './examStatus';
import { pendingProgress } from '@/features/practice/progress';
import { useProgressVersion } from '@/features/practice/progressSync';

/** Devuelve una función: id de simulacro → su estado (pendiente / completo / con errores / ninguno). */
export function useExamStatus(): (examId: string) => ExamStatus {
  const last = useQuery({ queryKey: ['last-finished'], queryFn: fetchLastFinished });
  useProgressVersion((s) => s.version); // se vuelve a dibujar si llega avance de otro dispositivo
  return (examId) => examStatus(!!pendingProgress(examId, 'full'), last.data?.[examId]);
}
