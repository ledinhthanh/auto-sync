import { describe, it, expect } from 'vitest';
import { topologicalSort, DependencyNode, ObjectId } from '../../src/services/dependency.service';
import { DestObjectType, Ownership } from '@prisma/client';

describe('dependency.service - topologicalSort', () => {
  const createNode = (id: string, dependedBy: string[] = [], dependsOn: string[] = []): [ObjectId, DependencyNode] => [
    id,
    {
      id,
      schema: id.split('.')[0],
      name: id.split('.')[1],
      objectType: DestObjectType.TABLE,
      ownership: Ownership.MANAGED,
      syncId: null,
      definition: null,
      dependsOn,
      dependedBy,
      lastSyncedAt: null,
      estimatedRows: null
    }
  ];

  it('should handle simple dependency: A depends on B (B -> A)', () => {
    // Mode drop: A then B. Mode recreate: B then A.
    const nodes = new Map<ObjectId, DependencyNode>([
      createNode('public.A', [], ['public.B']),
      createNode('public.B', ['public.A'], [])
    ]);

    const dropOrder = topologicalSort(nodes, 'public.B', 'drop');
    expect(dropOrder).toEqual(['public.A', 'public.B']);

    const recreateOrder = topologicalSort(nodes, 'public.B', 'recreate');
    expect(recreateOrder).toEqual(['public.B', 'public.A']);
  });

  it('should handle diamond dependency: B -> [C, D] -> E', () => {
    // B is root. E depends on C,D. C,D depend on B.
    // Graph: B -> C; B -> D; C -> E; D -> E
    // DependsOn: E:[C,D], C:[B], D:[B], B:[]
    // DependedBy: B:[C,D], C:[E], D:[E], E:[]
    const nodes = new Map<ObjectId, DependencyNode>([
      createNode('public.B', ['public.C', 'public.D'], []),
      createNode('public.C', ['public.E'], ['public.B']),
      createNode('public.D', ['public.E'], ['public.B']),
      createNode('public.E', [], ['public.C', 'public.D'])
    ]);

    const dropOrder = topologicalSort(nodes, 'public.B', 'drop');
    expect(dropOrder[0]).toBe('public.E');
    expect(dropOrder[dropOrder.length - 1]).toBe('public.B');

    const recreateOrder = topologicalSort(nodes, 'public.B', 'recreate');
    expect(recreateOrder[0]).toBe('public.B');
    expect(recreateOrder[recreateOrder.length - 1]).toBe('public.E');
  });

  it('should handle disconnected nodes correctly', () => {
     const nodes = new Map<ObjectId, DependencyNode>([
      createNode('public.A', ['public.B'], []),
      createNode('public.B', [], ['public.A']),
      createNode('public.X', [], [])
    ]);

    const affectedByA = topologicalSort(nodes, 'public.A', 'recreate');
    expect(affectedByA).toContain('public.A');
    expect(affectedByA).toContain('public.B');
    expect(affectedByA).not.toContain('public.X');
  });

  it('should detect cycle in dependency graph', () => {
    // A -> B -> C -> A (circular)
    const nodes = new Map<ObjectId, DependencyNode>([
      createNode('public.A', ['public.B'], ['public.C']),
      createNode('public.B', ['public.C'], ['public.A']),
      createNode('public.C', ['public.A'], ['public.B'])
    ]);

    expect(() => topologicalSort(nodes, 'public.A', 'drop')).toThrow('Circular dependency detected');
  });
});
