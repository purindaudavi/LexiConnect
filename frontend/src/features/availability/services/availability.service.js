import api from '../../../services/api';

const availabilityService = {
  // Real backend endpoints from lawyer_availability.py
  async fetchBranches() {
    console.log('🔍 AVAILABILITY SERVICE: fetchBranches() calling /api/lawyer-availability/branches');
    try {
      const response = await api.get('/api/lawyer-availability/branches');
      console.log('🔍 AVAILABILITY SERVICE: fetchBranches() response:', response);
      console.log('🔍 AVAILABILITY SERVICE: fetchBranches() response.data:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ AVAILABILITY SERVICE: fetchBranches() API call failed:', error);
      console.error('❌ AVAILABILITY SERVICE: fetchBranches() error response:', error.response);
      throw error;
    }
  },

  async listAvailability(lawyerUserId) {
    // Backend prefers lawyer_user_id as query parameter
    const response = await api.get(`/api/lawyer-availability/weekly?lawyer_user_id=${lawyerUserId}`);
    return response.data;
  },

  async createAvailability(payload, lawyerUserId) {
    // Backend prefers lawyer_user_id as query parameter
    if (!lawyerUserId) {
      throw new Error('Lawyer ID is required for creating availability');
    }
    
    const url = `/api/lawyer-availability/weekly?lawyer_user_id=${lawyerUserId}`;
    console.log('🔍 CREATE AVAILABILITY URL:', url);
    console.log('🔍 CREATE AVAILABILITY PAYLOAD:', payload);
    
    const response = await api.post(url, payload);
    return response.data;
  },

  async deleteAvailability(slotId) {
    const response = await api.delete(`/api/lawyer-availability/weekly/${slotId}`);
    return response.data;
  },

  // Helper to get current lawyer ID
  async getCurrentLawyerId() {
    try {
      console.log('🔍 FETCHING CURRENT USER ID FROM /users/me...');
      const me = await api.get('/users/me');
      console.log('🔍 /users/me RESPONSE:', me.data);
      console.log('🔍 /users/me DATA KEYS:', Object.keys(me.data || {}));
      
      const userId = me.data?.id;
      console.log('🔍 EXTRACTED USER ID:', userId);
      
      if (!userId) {
        console.error('❌ NO USER ID FOUND IN /users/me RESPONSE');
        throw new Error('No lawyer ID found in user profile');
      }
      
      return userId;
    } catch (error) {
      console.error('❌ FAILED TO GET CURRENT LAWYER ID:', error);
      console.log('🔍 TRYING FALLBACK TO LOCALSTORAGE...');
      
      // Fallback to localStorage
      const fallbackId = localStorage.getItem('lawyerId');
      console.log('🔍 LOCALSTORAGE LAWYER ID:', fallbackId);
      
      if (!fallbackId) {
        console.error('❌ NO LAWYER ID IN LOCALSTORAGE EITHER');
        throw new Error('Unable to identify current lawyer - please re-login');
      }
      
      return fallbackId;
    }
  },

  // Public wrapper methods (keep same interface for components)
  async getBranches() {
    console.log('🔍 AVAILABILITY SERVICE: getBranches() called');
    try {
      const result = await this.fetchBranches();
      console.log('🔍 AVAILABILITY SERVICE: fetchBranches() result:', result);
      console.log('🔍 AVAILABILITY SERVICE: result type:', typeof result);
      console.log('🔍 AVAILABILITY SERVICE: result length:', Array.isArray(result) ? result.length : 'Not an array');
      return result;
    } catch (error) {
      console.error('❌ AVAILABILITY SERVICE: getBranches() failed:', error);
      throw error;
    }
  },

  async getMyWeeklyAvailability() {
    const lawyerId = await this.getCurrentLawyerId();
    return await this.listAvailability(lawyerId);
  },

  async createWeeklyAvailability(payload) {
    const lawyerId = await this.getCurrentLawyerId();
    return await this.createAvailability(payload, lawyerId);
  },

  async deleteWeeklyAvailability(id) {
    await this.deleteAvailability(id);
  },

  // Rules endpoints (fallbacks)
  async createRule(payload) {
    const response = await api.post('/availability/rules', payload);
    return response.data;
  },

  async getMyRules() {
    const response = await api.get('/availability/rules/my');
    return response.data;
  },

  async deleteRule(ruleId) {
    await api.delete(`/availability/rules/${ruleId}`);
  },

  // Exceptions endpoints
  async createException(payload) {
    const response = await api.post('/availability/exceptions', payload);
    return response.data;
  },

  async getMyExceptions() {
    const response = await api.get('/availability/exceptions/my');
    return response.data;
  },

  async deleteException(exceptionId) {
    await api.delete(`/availability/exceptions/${exceptionId}`);
  },

  // Slots endpoints (public read)
  async getLawyerSlots(lawyerId, params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.date) {
      queryParams.append('date', params.date);
    }
    if (params.from) {
      queryParams.append('from', params.from);
    }
    if (params.to) {
      queryParams.append('to', params.to);
    }
    if (params.day) {
      queryParams.append('day', params.day);
    }
    if (params.after) {
      queryParams.append('after', params.after);
    }

    const url = queryParams.toString() 
      ? `/availability/lawyers/${lawyerId}/slots?${queryParams.toString()}`
      : `/availability/lawyers/${lawyerId}/slots`;

    const response = await api.get(url);
    return response.data;
  }
};

export default availabilityService;


