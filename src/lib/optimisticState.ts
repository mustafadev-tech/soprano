interface OptimisticUpdateOptions<TState, TResult> {
  currentState: TState;
  optimisticUpdate: (state: TState) => TState;
  apiCall: () => Promise<TResult>;
  onSuccess?: (result: TResult, optimisticState: TState) => void | Promise<void>;
  onError?: (error: unknown, originalState: TState) => void | Promise<void>;
  onRollback: (state: TState) => void;
}

export async function createOptimisticUpdate<TState, TResult>({
  currentState,
  optimisticUpdate,
  apiCall,
  onSuccess,
  onError,
  onRollback,
}: OptimisticUpdateOptions<TState, TResult>): Promise<TResult> {
  const optimisticState = optimisticUpdate(currentState);

  try {
    const result = await apiCall();
    await onSuccess?.(result, optimisticState);
    return result;
  } catch (error) {
    onRollback(currentState);
    await onError?.(error, currentState);
    throw error;
  }
}