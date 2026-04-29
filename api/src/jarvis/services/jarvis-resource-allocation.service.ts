import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ResourceAllocationRecord = {
  id: string;
  sessionId: string;
  resourceType: string;
  resourceName: string;
  allocatedHours: number;
  usedHours: number;
  allocationDate: string;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceCapacity = {
  resourceType: string;
  resourceName: string;
  totalAllocated: number;
  totalUsed: number;
  available: number;
  utilizationPercentage: number;
};

@Injectable()
export class JarvisResourceAllocationService {
  private readonly logger = new Logger(JarvisResourceAllocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async allocateResource(
    sessionId: string,
    input: {
      resourceType: string;
      resourceName: string;
      allocatedHours: number;
      allocationDate: Date;
      expiryDate?: Date;
    },
  ): Promise<ResourceAllocationRecord | null> {
    try {
      const allocation = await this.prisma.jarvisResourceAllocation.create({
        data: {
          sessionId,
          resourceType: input.resourceType.toLowerCase(),
          resourceName: input.resourceName,
          allocatedHours: input.allocatedHours,
          usedHours: 0,
          allocationDate: input.allocationDate,
          expiryDate: input.expiryDate || null,
        },
      });

      return this.mapAllocationRecord(allocation);
    } catch (error) {
      this.logger.error(
        `Failed to allocate resource ${input.resourceName}: ${error}`,
      );
      return null;
    }
  }

  async recordUsage(
    sessionId: string,
    resourceType: string,
    resourceName: string,
    usedHours: number,
  ): Promise<ResourceAllocationRecord | null> {
    try {
      const current = await this.prisma.jarvisResourceAllocation.findFirst({
        where: {
          sessionId,
          resourceType: resourceType.toLowerCase(),
          resourceName,
          expiryDate: { gte: new Date() },
        },
        orderBy: { allocationDate: 'desc' },
      });

      if (!current) {
        this.logger.warn(
          `No active allocation found for ${resourceType}/${resourceName}`,
        );
        return null;
      }

      const updated = await this.prisma.jarvisResourceAllocation.update({
        where: { id: current.id },
        data: {
          usedHours: Math.min(
            current.usedHours + usedHours,
            current.allocatedHours,
          ),
        },
      });

      return this.mapAllocationRecord(updated);
    } catch (error) {
      this.logger.error(
        `Failed to record usage for ${resourceType}/${resourceName}: ${error}`,
      );
      return null;
    }
  }

  async getCapacity(
    sessionId: string,
    resourceType?: string,
  ): Promise<ResourceCapacity[]> {
    try {
      const allocations = await this.prisma.jarvisResourceAllocation.findMany({
        where: {
          sessionId,
          ...(resourceType ? { resourceType: resourceType.toLowerCase() } : {}),
          expiryDate: { gte: new Date() },
        },
      });

      const capacityMap = new Map<string, ResourceCapacity>();

      for (const alloc of allocations) {
        const key = `${alloc.resourceType}:${alloc.resourceName}`;
        const existing = capacityMap.get(key) || {
          resourceType: alloc.resourceType,
          resourceName: alloc.resourceName,
          totalAllocated: 0,
          totalUsed: 0,
          available: 0,
          utilizationPercentage: 0,
        };

        existing.totalAllocated += alloc.allocatedHours;
        existing.totalUsed += alloc.usedHours;
        existing.available = existing.totalAllocated - existing.totalUsed;
        existing.utilizationPercentage =
          existing.totalAllocated > 0
            ? (existing.totalUsed / existing.totalAllocated) * 100
            : 0;

        capacityMap.set(key, existing);
      }

      return Array.from(capacityMap.values());
    } catch (error) {
      this.logger.error(`Failed to get capacity for ${sessionId}: ${error}`);
      return [];
    }
  }

  async findConstrainedResource(
    sessionId: string,
    threshold: number = 80,
  ): Promise<ResourceCapacity | null> {
    try {
      const capacities = await this.getCapacity(sessionId);
      const constrained = capacities.find(
        (c) => c.utilizationPercentage >= threshold,
      );
      return constrained || null;
    } catch (error) {
      this.logger.error(
        `Failed to find constrained resource for ${sessionId}: ${error}`,
      );
      return null;
    }
  }

  async suggestResourceOptimization(
    sessionId: string,
  ): Promise<{ resource: string; suggestion: string }[]> {
    try {
      const capacities = await this.getCapacity(sessionId);
      const suggestions: { resource: string; suggestion: string }[] = [];

      for (const capacity of capacities) {
        if (capacity.utilizationPercentage > 90) {
          suggestions.push({
            resource: `${capacity.resourceType}/${capacity.resourceName}`,
            suggestion: `Critical capacity: ${capacity.totalUsed.toFixed(1)}/${capacity.totalAllocated.toFixed(1)} hours used. Consider deferring non-critical tasks or requesting additional allocation.`,
          });
        } else if (capacity.utilizationPercentage > 75) {
          suggestions.push({
            resource: `${capacity.resourceType}/${capacity.resourceName}`,
            suggestion: `High utilization: ${capacity.totalUsed.toFixed(1)}/${capacity.totalAllocated.toFixed(1)} hours. Monitor closely for bottlenecks.`,
          });
        }

        if (capacity.available > capacity.totalAllocated * 0.3) {
          suggestions.push({
            resource: `${capacity.resourceType}/${capacity.resourceName}`,
            suggestion: `Significant unused capacity: ${capacity.available.toFixed(1)} hours. Consider reallocating or reducing budget.`,
          });
        }
      }

      return suggestions;
    } catch (error) {
      this.logger.error(
        `Failed to suggest optimization for ${sessionId}: ${error}`,
      );
      return [];
    }
  }

  private mapAllocationRecord(allocation: any): ResourceAllocationRecord {
    return {
      id: allocation.id,
      sessionId: allocation.sessionId,
      resourceType: allocation.resourceType,
      resourceName: allocation.resourceName,
      allocatedHours: allocation.allocatedHours,
      usedHours: allocation.usedHours,
      allocationDate: allocation.allocationDate.toISOString(),
      expiryDate: allocation.expiryDate?.toISOString() || null,
      createdAt: allocation.createdAt.toISOString(),
      updatedAt: allocation.updatedAt.toISOString(),
    };
  }
}
