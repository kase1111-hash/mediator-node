#!/usr/bin/env node

import { Command } from 'commander';
import { MediatorNode } from './MediatorNode';
import { ConfigLoader } from './config/ConfigLoader';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('mediator-node')
  .description('NatLangChain Mediator Node - Earn fees through intent alignment')
  .version('1.0.0');

program
  .command('start')
  .description('Start the mediator node')
  .option('-c, --config <path>', 'Path to .env configuration file')
  .option('-d, --daemon', 'Run as daemon')
  .action(async (options) => {
    try {
      logger.info('🚀 Starting NatLangChain Mediator Node');

      // Load configuration
      const config = ConfigLoader.load(options.config);

      // Create and start mediator node
      const node = new MediatorNode(config);
      await node.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await node.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await node.stop();
        process.exit(0);
      });

      // Keep the process running
      if (!options.daemon) {
        logger.info('Mediator node is running. Press Ctrl+C to stop.');
      }
    } catch (error) {
      logger.error('Failed to start mediator node', { error });
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check mediator node status')
  .option('-c, --config <path>', 'Path to .env configuration file')
  .action(async (options) => {
    try {
      const config = ConfigLoader.load(options.config);

      logger.info('Mediator Node Configuration:');
      logger.info(`  Chain ID: ${config.chainId}`);
      logger.info(`  Consensus Mode: ${config.consensusMode}`);
      logger.info(`  Mediator ID: ${config.mediatorPublicKey}`);
      logger.info(`  LLM Provider: ${config.llmProvider}`);
      logger.info(`  Facilitation Fee: ${config.facilitationFeePercent}%`);

      if (config.consensusMode === 'dpos' || config.consensusMode === 'hybrid') {
        logger.info(`  Bonded Stake: ${config.bondedStakeAmount || 0}`);
        logger.info(`  Min Effective Stake: ${config.minEffectiveStake || 0}`);
      }

      if (config.consensusMode === 'poa' || config.consensusMode === 'hybrid') {
        logger.info(`  PoA Authority: ${config.poaAuthorityKey ? 'Configured' : 'Not Set'}`);
      }
    } catch (error) {
      logger.error('Error checking status', { error });
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration file')
  .option('-o, --output <path>', 'Output path for .env file', '.env')
  .action((options) => {
    const fs = require('fs');
    const examplePath = '.env.example';

    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, options.output);
      logger.info(`Configuration file created at ${options.output}`);
      logger.info('Please edit the file and fill in your credentials and settings.');
    } else {
      logger.error('.env.example file not found');
      process.exit(1);
    }
  });

program.parse();
