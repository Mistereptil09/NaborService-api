import { Neo4jService } from '../neo4j.service';
import { Driver, Session } from 'neo4j-driver';

describe('Neo4jService', () => {
  let service: Neo4jService;
  let mockDriver: jest.Mocked<Driver>;
  let mockSession: jest.Mocked<Session>;

  beforeEach(() => {
    jest.useFakeTimers();

    mockSession = {
      run: jest.fn(),
      executeWrite: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<Session>;

    mockDriver = {
      session: jest.fn().mockReturnValue(mockSession),
      close: jest.fn(),
    } as unknown as jest.Mocked<Driver>;

    service = new Neo4jService(mockDriver);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should execute a query and close the session', async () => {
    const mockResult = { records: [] };
    mockSession.run.mockResolvedValueOnce(mockResult as any);

    const result = await service.run('RETURN 1');

    expect(result).toBe(mockResult);
    expect(mockDriver.session).toHaveBeenCalledTimes(1);
    expect(mockSession.run).toHaveBeenCalledWith('RETURN 1', undefined);
    expect(mockSession.close).toHaveBeenCalledTimes(1);
  });

  it('should close the session on query execution error', async () => {
    const mockError = new Error('Query error');
    mockSession.run.mockRejectedValueOnce(mockError);

    await expect(service.run('RETURN 1')).rejects.toThrow('Query error');

    expect(mockDriver.session).toHaveBeenCalledTimes(1);
    expect(mockSession.close).toHaveBeenCalledTimes(1);
  });

  it('should retry transient errors with exponential backoff', async () => {
    const transientError = {
      code: 'Neo.TransientError.General.DatabaseUnavailable',
      message: 'Database is busy',
    };
    const mockResult = { records: ['success'] };

    mockSession.run
      .mockRejectedValueOnce(transientError) // 1st attempt: fails
      .mockRejectedValueOnce(transientError) // 2nd attempt: fails
      .mockResolvedValueOnce(mockResult as any); // 3rd attempt: succeeds

    const runPromise = service.run('RETURN 1');

    // Attempt 1 fails, schedules retry after 1s
    await jest.advanceTimersByTimeAsync(1000);

    // Attempt 2 fails, schedules retry after 5s
    await jest.advanceTimersByTimeAsync(5000);

    const result = await runPromise;

    expect(result).toBe(mockResult);
    expect(mockDriver.session).toHaveBeenCalledTimes(3);
    expect(mockSession.close).toHaveBeenCalledTimes(3);
  });

  it('should propagate error after all retries are exhausted', async () => {
    const transientError = {
      code: 'Neo.TransientError.General.DatabaseUnavailable',
      message: 'Database is busy',
    };

    mockSession.run.mockRejectedValue(transientError); // always fails

    const runPromise = service.run('RETURN 1');
    runPromise.catch(() => {});

    // Attempt 1 fails, schedules 1s
    await jest.advanceTimersByTimeAsync(1000);

    // Attempt 2 fails, schedules 5s
    await jest.advanceTimersByTimeAsync(5000);

    // Attempt 3 fails, schedules 30s
    await jest.advanceTimersByTimeAsync(30000);

    // Attempt 4 fails, retries exhausted, throws
    await expect(runPromise).rejects.toEqual(transientError);

    expect(mockDriver.session).toHaveBeenCalledTimes(4);
    expect(mockSession.close).toHaveBeenCalledTimes(4);
  });

  it('should execute work in transaction and close session', async () => {
    const mockResult = 'tx result';
    mockSession.executeWrite.mockImplementationOnce(async (work) => {
      return work({} as any);
    });

    const result = await service.runInTransaction(async () => mockResult);

    expect(result).toBe(mockResult);
    expect(mockDriver.session).toHaveBeenCalledTimes(1);
    expect(mockSession.executeWrite).toHaveBeenCalledTimes(1);
    expect(mockSession.close).toHaveBeenCalledTimes(1);
  });
});
